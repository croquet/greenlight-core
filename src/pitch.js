/*
Copyright 2020 Croquet Corporation.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

/* globals Croquet */
/* eslint-disable no-template-curly-in-string */

class TransformModel {
    init() {
        this.subscribe(this.id, "newIFrame", "newIFrame");
        this.subscribe(this.id, "newImage", "newImage");
        this.subscribe(this.id, "newText", "newText");

        this.subscribe(this.id, "viewport", "viewport");
        this.subscribe(this.sessionId, "viewPointerMoved", "pointerMoved");

        this.subscribe(this.id, "startPresentation", "startPresentation");
        this.subscribe(this.id, "stopPresentation", "stopPresentation");
        this.subscribe(this.id, "forceStopPresentation", "forceStopPresentation");
        this.subscribe(this.id, "setFollowing", "setFollowing");

        this.subscribe(this.sessionId, "view-join", "addUser");
        this.subscribe(this.sessionId, "view-exit", "deleteUser");

        this.subscribe(this.sessionId, "localUserJoin", "localUserJoin");

        this.ensureClientViewRecords();

        console.log("TransformModel.init");
    }

    // the clientViewRecords structure is keyed by viewId.  for each client it holds
    //   lastViewport: last announced scalerRect
    //   lastPointer: last known x, y and target for the pointer
    //   lastActive: teatime of last significant update (viewport or pointer)
    //   active: whether now to be considered active
    ensureClientViewRecords() {
        if (this._get("clientViewRecords")) return;

        // console.log("init clientViewRecords");
        this._set("clientViewRecords", {});
        this._set("presentingViewId", null);
        this.future(500).call("TransformModel", "checkForInactiveClients");
    }

    addUser(viewId) {
        let clientViewRecords = this._get("clientViewRecords");
        let newValue = {...clientViewRecords};
        newValue[viewId] = {}; // just set up the entry
        this._set("clientViewRecords", newValue);
        console.log("TransformModel.addUser", newValue);
        this.publish(this.id, "addUser", viewId); // subscribed by transformView
    }

    deleteUser(viewId) {
        let clientViewRecords = this._get("clientViewRecords");
        let newValue = {...clientViewRecords};
        delete newValue[viewId];
        this._set("clientViewRecords", newValue);
        console.log("TransformModel.deleteUser", newValue);
        let presenterId = this._get("presentingViewId");
        if (presenterId === viewId) {
            this._set("presentingViewId", null);
            this.publish(this.sessionId, "presentationStopped");
        }
        this.publish(this.id, "deleteUser", viewId); // subscribed by transformView
    }

    localUserJoin(viewId) {
        // only for the ?isLocal case
        this.addUser(viewId);
        console.log("localUserJoin", viewId);
    }

    editClientViewRecord(viewId, fn, activateIfNeeded) {
        // fn will be supplied a clone of the record corresponding to the viewId,
        // and should update it in place.
        // return true if the edit takes place, false if viewId was not found.
        let clientViewRecords = this._get("clientViewRecords");
        let viewRecord = clientViewRecords[viewId];
        if (viewRecord === undefined) return false;

        let newValue = {...clientViewRecords};
        let newRecord = {...viewRecord};
        if (fn) fn(newRecord);
        if (activateIfNeeded && !newRecord.active) {
            newRecord.active = true;
            newRecord.lastActive = this.now();
            this.publish(this.sessionId, "userCursorUpdated", viewId);
        }
        newValue[viewId] = newRecord;
        this._set("clientViewRecords", newValue);
        return true;
    }

    checkForInactiveClients() {
        let clientViewRecords = this._get("clientViewRecords");
        Object.keys(clientViewRecords).forEach(viewId => {
            let viewRecord = clientViewRecords[viewId];
            let { lastActive, active } = viewRecord;
            // a client that has no active status, one way or the other, is
            // presumed active but the clock starts ticking immediately.
            if (active === undefined) {
                this.editClientViewRecord(viewId, null, true); // just activate
            } else if (active && this.now() - lastActive > 5000) {
                this.editClientViewRecord(viewId, record => record.active = false);
                this.publish(this.sessionId, "userCursorUpdated", viewId);
            }
        });

        this.future(500).call("TransformModel", "checkForInactiveClients");
    }

    pointerMoved(data) {
        // record and handle a viewPointerMoved message
        let { viewId, ...pointer } = data;
        let found = this.editClientViewRecord(viewId, record => record.lastPointer = pointer, true); // activate if needed
        if (!found) {return;}

        this.publish(this.id, "pointerMoved", data); // subscribed by transformView
    }

    viewport(data) {
        // store every change for which we know there's a view
        let { viewId, scalerRect } = data;
        let found = this.editClientViewRecord(viewId, record => record.lastViewport = scalerRect, true); // activate if needed
        if (!found) {return;}

        // when the moving view is the presenter, automatically update
        // viewport records of all views that we believe are following.
        let presenterId = this._get("presentingViewId"); // or null
        if (viewId === presenterId) {
            let clientViewRecords = this._get("clientViewRecords");
            Object.keys(clientViewRecords).forEach(viewId2 => {
                if (viewId2 !== presenterId) {
                    let record = clientViewRecords[viewId2];
                    if (record.isFollowing) {
                        this.editClientViewRecord(viewId2, rec => rec.lastViewport = {...scalerRect});
                    }
                }
            });
        }
        this.publish(this.id, "viewportChanged", data); // subscribed by transformView
    }

    startPresentation(requestingId) {
        // reject if there is already a view presenting
        let presenterId = this._get("presentingViewId");
        if (presenterId) {
            console.warn(`${requestingId} can't present while ${presenterId} is presenting`);
            return;
        }
        console.log(`${requestingId} starting presentation`);
        this._set("presentingViewId", requestingId);

        // start by assuming that all other views are following.  any
        // of them can opt out later if the user wants.
        let clientViewRecords = this._get("clientViewRecords");
        Object.keys(clientViewRecords).forEach(viewId => {
            if (viewId !== requestingId) this.setFollowing({ viewId, isFollowing: true });
        });

        this.publish(this.sessionId, "presentationStarted"); // to view
        this.publish(this.sessionId, "allUserCursorsUpdated");
    }

    forceStopPresentation(requestingId) {
        this.stopPresentation(requestingId, true);
    }

    stopPresentation(requestingId, force) {
        // reject if the view is somehow already not presenting, or force it if force is true
        let presenterId = this._get("presentingViewId");
        if (!force && (presenterId !== requestingId)) {
            console.warn(`rejecting ${requestingId} request to stop presenting; presenter is ${presenterId}`);
            return;
        }
        console.log(`${requestingId} stopping presentation`);
        this._set("presentingViewId", null);

        // mark all other views as not following anyone
        let clientViewRecords = this._get("clientViewRecords");
        Object.keys(clientViewRecords).forEach(viewId => {
            if (viewId !== requestingId) this.setFollowing({ viewId, isFollowing: false });
        });

        this.publish(this.sessionId, "presentationStopped"); // to view
        this.publish(this.sessionId, "allUserCursorsUpdated");
    }

    setFollowing(data) {
        // either invoked directly by the model, at start or stop of
        // a presentation, or in response to an individual client
        // announcing that it is following (or not) the presenter.
        let { viewId, isFollowing } = data;

        // if there is no presenter, make sure we're not accidentally
        // setting isFollowing to true.
        let presenterId = this._get("presentingViewId");
        if (!presenterId) isFollowing = false;

        if (isFollowing) {
            let clientViewRecords = this._get("clientViewRecords");
            let scalerRect = clientViewRecords[presenterId].lastViewport;
            this.editClientViewRecord(viewId, record => {
                record.isFollowing = true;
                record.lastViewport = {...scalerRect};
            });
        } else {
            this.editClientViewRecord(viewId, record => record.isFollowing = false);
        }
    }

    addFrame(frame) {
        let scaler = this.querySelector("#scaler");
        if (scaler) {
            scaler.call("PasteUpModel", "addFrame", frame);
        }
    }

    /* BUILT-IN
    builtInNewDrawing(info) {
        let {x, y, width, height} = info;
        let draw = this.createElement();
        draw.domId = "draw";
        draw.setCode("drawing.Draw");
        draw.setViewCode("drawing.DrawView");

        draw.classList.add("no-select");
        draw.style.setProperty("-cards-direct-manipulation", true);
        let t = "1,0,0,1," + 0 + "," + 0;
        draw.setTransform(t);
        // draw.style.setProperty("border", "1px solid gray");
        // draw.style.setProperty("border-radius", "7px");
        draw.call("Draw", "setExtent", width, height);

        let frame = this.createElement();
        frame.setCode("boards.FrameModel");
        frame.setViewCode("boards.FrameView");
        frame.call("FrameModel", "setObject", draw, {x, y});

        this.addFrame(frame);
    }
    */

    newImage(asset) {
        let {handle, type, width, height, displayPoint} = asset; // viewId
        let img = this.createElement();
        img.style.setProperty("-cards-direct-manipulation", true);
        img.style.setProperty("width", `${width}px`);
        img.style.setProperty("height", `${height}px`);
        img.style.setProperty("-cards-background-image-asset", { handle, type });

        img.style.setProperty("background-size", "contain");
        img.style.setProperty("background-repeat", "no-repeat");
        img.style.setProperty("background-position", "center");
        let x = displayPoint.x; // currentZoom;
        let y = displayPoint.y; // currentZoom;

        img.setTransform([1, 0, 0, 1, 0, 0]);

        let frame = this.createElement();
        frame.setCode("boards.FrameModel");
        frame.setViewCode("boards.FrameView");
        frame.call("FrameModel", "setObject", img, {x, y});
        frame.call("FrameModel", "beSolidBackground");
        this.addFrame(frame);
    }

    newText(info) {
        let {x, y, width, height} = info;

        let text = this.createElement();
        text.domId = "stickyNote";
        text.classList.add("sticky-note-text");
        text.setCode("text.TextModel");

        let frame = this.createElement();
        frame.setCode("boards.FrameModel");
        frame.setViewCode("boards.FrameView");

        let titleHeight = frame.call("FrameModel", "getTitleHeight");
        text.call("TextModel", "setup", width, height - titleHeight);
        frame.call("FrameModel", "setObject", text, { x, y });

        this.addFrame(frame);
    }

    newIFrame(info) {
        let {x, y, width, height, viewId, type, appInfo} = info;
        let browser = this.createElement();
        browser.domId = "miniBrowser";
        browser._set("useExternalAddress", true);
        browser.setCode("minibrowser.MiniBrowser");
        browser.setViewCode("minibrowser.MiniBrowserView");
        browser.style.setProperty("-cards-direct-manipulation", true);
        browser.setTransform([1, 0, 0, 1, 0, 0]);

        let frame = this.createElement();
        frame.setCode("boards.FrameModel");
        frame.setViewCode("boards.FrameView");
        frame._set("hasAddressBar", true);

        // adjust the embedded minibrowser's height to take account
        // of the frame's title bar
        let titleHeight = frame.call("FrameModel", "getTitleHeight");
        frame.call("FrameModel", "setObject", browser, {x, y});
        browser.call("MiniBrowser", "setExtent", width, height - titleHeight);

        if (info.url) {
            browser.call("MiniBrowser", "url", info.url, true);
        } else {
            browser.call("MiniBrowser", "setCoverContent", type);
        }

        browser.call("MiniBrowser", "setAppInfo", appInfo);

        // some apps (e.g., cobrowser) want to know which user created
        // the frame.
        let scaler = this.querySelector("#scaler");
        let userInfo = scaler ? scaler._get("userInfo")[viewId] : null;
        let userId = userInfo ? userInfo.userId : viewId;
        browser.call("MiniBrowser", "setCreatingUser", userId);
        this.addFrame(frame);
    }
}

class TransformView {
    init() {
        this.subscribe(this.sessionId, "toolButtonPressed", "toolButtonPressed");
        this.subscribe(this.sessionId, "followButton", "followButtonPressed");

        this.subscribe(this.model.id, "addUser", "addUser");
        this.subscribe(this.model.id, "deleteUser", "deleteUser");

        this.subscribe(this.sessionId, "presentationStarted", "presentationStarted");
        this.subscribe(this.sessionId, "presentationStopped", "presentationStopped");
        this.subscribe(this.model.id, "pointerMoved", "pointerMoved");
        this.subscribe(this.model.id, "viewportChanged", "viewportChanged");
        this.subscribe(this.sessionId, "favoritesChanged", "favoritesChanged"); // published by PasteUpModel and PasteUpView
        this.subscribe(this.sessionId, { event: "userAppsChanged", handling: "immediate" }, "TransformView.userAppsChanged"); // published by PasteUpView.  immediate to allow instant highlighting during a drag operation.
        this.subscribe(this.sessionId, "sessionAppUpdated", "sessionAppUpdated"); // published by PasteUpModel

        this.subscribe(this.sessionId, "zoomInButton", "zoomInButtonPressed");
        this.subscribe(this.sessionId, "zoomOutButton", "zoomOutButtonPressed");
        this.subscribe(this.sessionId, "recenterButton", "homeButtonPressed");
        this.subscribe(this.sessionId, "localWindowResized", "windowResize");
        this.subscribe(this.sessionId, "annotationButton", "annotationButtonPressed");
        this.subscribe(this.sessionId, "annotationDone", "annotationDone");

        this.following = null;

        // plug this object/trait into the topView as the means of accessing
        // viewport and presenter details.
        window.topView.viewportTracker = {
            target: this,
            trait: "TransformView",
            getPresenter: "getPresenter",
            getViewDetails: "getViewDetails"
        };

        window.topView.requestInitialization(this, "TransformView", "setup");
        console.log("TransformView.init");
    }

    setup() {
        let scalerKey = this.dom.querySelector("#scaler").key;
        this.scaler = window.views[scalerKey];

        this.scaler.currentZoom = 1;
        this.scrollToHome();

        this.dom.addEventListener("pointerdown", (evt) => this.pointerDown(evt), true);
        this.dom.addEventListener("dblclick", (evt) => this.dblClick(evt));
        this.dom.addEventListener("wheel", (evt) => this.wheel(evt)); //, true);
        this.dom.addEventListener("scroll", evt => this.scroll(evt));

        let canv = this.followCanvas = document.createElement("canvas");
        canv.width = canv.height = this.followCanvasWidth = this.followCanvasHeight = 1000;
        canv.style.width = "100%";
        canv.style.height = "100%";
        canv.style.position = "absolute";
        canv.style.pointerEvents = "none";
        this.dom.parentNode.appendChild(canv);

        this.updateAllPointers();

        let presenterId = this.getPresenter();
        if (presenterId) {
            this.joinPresentation(true); // tellModel
        }

        // https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Pinch_zoom_gestures
        this.evCache = [];
        this.origDiff = -1;
        this.origZoom = 1;
        this.noDrag = false;

        this.hasPendingAppsUpdate = false;
        this.resetToolState();

        this.setupFontStyle();

        window.document.fonts.ready.then(() => {
            window.topView.setLastFontLoadedTime(Date.now());
        });
        this.setRoomName();
        this.windowResize(true);
    }

    setRoomName() {
        let roomName = window.topView.querySelector("#roomName");
        if (roomName && window.fromLandingPage) {
            roomName.call("RoomNameView", "setName", window.fromLandingPage.boardName);
        }
    }

    setupFontStyle() {
        // it is a bit of a hack as the directory in styleString may disappear after installing a new version

        let path = window._production;
        let style = document.createElement("style");
        style.innerHTML = `
@font-face {
  font-family: 'OpenSans-Regular';
  src: url("${path}/assets/fonts/open-sans-v17-latin-ext_latin-regular.woff2") format('woff2');
}

@font-face {
  font-family: 'OpenSans-SemiBold';
  src: url('${path}/assets/fonts/open-sans-v17-latin-ext_latin-600.woff2') format('woff2');
}

@font-face {
    font-family: 'Poppins-Medium';
    src: url('${path}/assets/fonts/Poppins-Medium.woff2') format('woff2');
}
`;
        document.body.appendChild(style);
    }


    dblClick(_evt) {
        let radar = window.topView.querySelector("#radar");
        let visibleRect = this.getVisibleClientRect();
        let viewport = radar.call("RadarView", "computeView", false, null, {width: visibleRect.width}, null);

        if (viewport.offsetX > 20000 || viewport.offsetY > 20000) {
            // basically there is no element in scalar and the viewport computation returns
            // undefined values;
            this.scrollToHome();
            return;
        }

        this.zoom(viewport.scale);

        this.setScroll(viewport.centerX * viewport.scale - visibleRect.width / 2, viewport.centerY * viewport.scale - visibleRect.height / 2, true);
    }

    addUser(_viewId) {
        // just here for symmetry with deleteUser
        console.log("transformview.addUser");
        if (this.scaler) {
            this.scaler.call("PasteUpView", "handleEnterSoundRequest");
        }
    }

    deleteUser(viewId) {
        this.deletePointer(viewId);
        if (this.scaler) {
            this.scaler.call("PasteUpView", "handleLeaveSoundRequest");
        }
    }

    windowResize(firstTime) {
        if (!this.scaler) return; // setup hasn't happened yet

        let tools = window.topView.querySelector("#tools");
        if (tools) {
            tools.call("ToolsView", "windowResize", firstTime);
        }

        if (this.following) {
            this.adjustToFollowedViewport();
        } else {
            this.zoomAboutCenter(1); // readjust, keeping same zoom level
        }

        let annotation = this.parentNode.querySelector("#annotation-canvas");
        if (annotation) {
            let rect = this.dom.getBoundingClientRect();
            annotation.call("DrawView", "resizeAndDraw", rect.width, rect.height);
        }
        this.adjustHeaderPosition();
    }

    adjustHeaderPosition() {
        let header = window.topView.querySelector("#header");
        let peers = window.topView.querySelector("#peers");
        if (header) {
            let rect = this.dom.getBoundingClientRect();
            let pRect = peers.dom.getBoundingClientRect();
            let hRect = header.dom.getBoundingClientRect();
            let available = rect.width - pRect.width;
            let left = ((available - hRect.width) / 2);

            header.dom.style.setProperty("max-width", `${available}px`);
            if (left >= 0) {
                header.dom.style.setProperty("left", `${left}px`);
            } else {
                header.dom.style.setProperty("left", "0px");
            }

            let tooltip = header.querySelector("#participants-tooltip");
            if (tooltip) {
                let tRect = tooltip.dom.getBoundingClientRect();
                let tLeft = (hRect.width - tRect.width) / 2;
                tooltip.dom.style.setProperty("left", `${tLeft}`);
            }
        }
    }

    // return the current client coordinates of the visible board
    // area - as flanked by the header, the tools, the peers, and the
    // info bar.
    getVisibleClientRect() {
        let left, top;
        if (false) {
            // old screen setup: full-width header, full-height tools
            if (!this.toolsView) this.toolsView = window.topView.querySelector("#tools");
            left = this.toolsView.dom.getBoundingClientRect().right;

            if (!this.headerView) this.headerView = window.topView.querySelector("#header");
            top = this.headerView.dom.getBoundingClientRect().bottom;
        } else {
            // new: desktop extends to top and left
            let rect = this.dom.getBoundingClientRect();
            left = rect.left;
            top = rect.top;
        }

        if (!this.infoBarView) this.infoBarView = window.topView.querySelector("#infoBar");
        let bottom = this.infoBarView.dom.getBoundingClientRect().top;

        if (!this.peersView) this.peersView = window.topView.querySelector("#peers");
        let right = this.peersView.dom.getBoundingClientRect().left;

        return { x: left, y: top, width: right - left, height: bottom - top };
    }

    // return the (unscaled) rectangle of the scaler now visible
    // in the board area.
    getVisibleScalerRect() {
        let rect = this.dom.getBoundingClientRect();
        let visibleRect = this.getVisibleClientRect();
        let translation = this.scaler.currentTranslation;
        let zoom = this.scaler.currentZoom;
        let left = (translation.x + visibleRect.x - rect.x) / zoom;
        let top = (translation.y + visibleRect.y - rect.y) / zoom;
        let width = visibleRect.width / zoom;
        let height = visibleRect.height / zoom;
        return { x: left, y: top, width, height };
    }

    jumpViewport(coord) {
        let {x, y} = coord;
        this.setScroll(x, y, true); // publish
    }

    scrollToHome() {
        let presenterId = this.getPresenter();
        if (presenterId && presenterId !== this.viewId && this.following) {
            this.adjustToFollowedViewport(true); // true => locally triggered change
            return;
        }

        this.zoom(1);

        let sRect = this.scaler.dom.getBoundingClientRect();
        let rect = this.dom.getBoundingClientRect();
        let translationX = (sRect.width - rect.width) / 2;
        let translationY = (sRect.height - rect.height) / 2;

        this.setScroll(translationX, translationY, true);
    }

    homeButtonPressed() {
        this.scrollToHome();
    }

    dashboardButtonPressed() {
        let url = new URL(window.location.href);
        let team = url.searchParams.get("t");

        let newURL = `${url.origin}${url.pathname}?t=${team}`;
        window.open(newURL, "_blank");
    }

    radarButtonPressed() {
        let radarView = window.topView.querySelector("#radar");
        radarView.call("RadarView", "toggle");
    }

    zoomInButtonPressed() {
        this.zoomAboutCenter(1.1);
    }

    zoomOutButtonPressed() {
        this.zoomAboutCenter(1 / 1.1);
    }

    zoomAboutCenter(changeRatio) {
        this.zoomAboutPoint(this.scaler.currentZoom * changeRatio);
    }

    zoomAboutPoint(desiredZoom, fixedClientX, fixedClientY) {
        let translation = this.scaler.currentTranslation;

        if (fixedClientX === undefined && fixedClientY === undefined) {
            // calculate the center point when arguments are not supplied
            let rect = this.dom.getBoundingClientRect();
            fixedClientX = rect.width / 2;
            fixedClientY = rect.height / 2;
        }

        let oldZoom = this.scaler.currentZoom;
        let newZoom = this.constrainedZoom(desiredZoom);
        if (newZoom !== oldZoom) {
            this.zoom(newZoom);

            // old coordinate, on the unzoomed scaler, of the
            // designated fixed point.
            let fixedX = (translation.x + fixedClientX) / oldZoom;
            let fixedY = (translation.y + fixedClientY) / oldZoom;

            // offset for the newly zoomed scaler, so the point
            // remains stationary in the client.
            translation = { x: fixedX * newZoom - fixedClientX, y: fixedY * newZoom - fixedClientY };
        }

        this.setScroll(translation.x, translation.y, true); // publish
    }

    followButtonPressed() {
        if (this.followMenu) {
            this.followMenu.remove();
            this.followMenu = null;
            return;
        }

        if (!this.following) {
            let b = window.topView.querySelector("#followButton");
            let users = this.model._get("clientViewRecords"); // viewId to record
            if (!users) {return;}
            let viewIds = Object.keys(users).filter(id => id !== this.viewId);
            let menu = this.makeFollowMenu(viewIds);
            menu.addEventListener("input", (evt) => this.followerSelected(evt));
            menu.style.setProperty("position", "absolute");
            let rect = b.dom.getBoundingClientRect();
            menu.style.setProperty("left", (rect.x + 20) + "px");
            menu.style.setProperty("top", (rect.y + 20) + "px");
            menu.style.setProperty("z-index", "10");
            this.followMenu = menu;
            b.dom.parentNode.appendChild(menu);
        } else {
            this.unfollow();
        }
    }

    makeFollowMenu(viewIds) {
        let select = document.createElement("select");
        select.size = "" + viewIds.length + 1;

        let title = document.createElement("option");
        title.disabled = true;
        title.selected = true;
        title.innerHTML = "Select the user to follow";
        title.style.setProperty("font-size", "20px");
        select.appendChild(title);

        viewIds.forEach((viewId) => {
            let opt = document.createElement("option");
            opt.innerHTML = this.scaler.call("PasteUpView", "getUserInfo", viewId).nickname || viewId;
            opt.value = viewId;
            opt.style.setProperty("font-size", "20px");
            select.appendChild(opt);
        });
        return select;
    }

    followerSelected(evt) {
        let viewId = evt.target.value;
        evt.target.remove();
        this.followMenu = null;

        // let followButton = window.topView.querySelector("#followButton");
        // followButton.call("ButtonView", "setButtonLabel", `Following: ${value}`, "black");
        this.follow(viewId);
    }

    getPresenter() {
        return this.model._get("presentingViewId");
    }

    getViewDetails(viewId) {
        let isLocal = viewId === this.viewId;
        let presenterId = this.getPresenter();
        let isPresenter = viewId === presenterId;
        let isFollower = presenterId && !isPresenter && !(isLocal && !this.following);
        let viewRecords = this.model._get("clientViewRecords");
        let isActive = viewRecords[viewId] && viewRecords[viewId].active;
        return { isLocal, isPresenter, isFollower, isActive };
    }

    presentationStarted() {
        this.joinPresentation(false); // tellModel = false: model already knows
    }

    joinPresentation(tellModel) {
        let presenterId = this.getPresenter();
        if (!presenterId) {
            console.warn(`no presentation to follow`);
            return;
        }
        if (presenterId === this.viewId) {
            let name = this.scaler.call("PasteUpView", "getUserInitials", presenterId);
            this.setPresenterString(`PRESENTING AS "${name}"`, "purple");

            // hack - accessing a pure view-side object
            let presentationButtonDom = document.getElementById("presentationButton");
            presentationButtonDom.classList.add("app-selected");

            return;
        }
        console.log(`starting to follow ${presenterId}`);
        if (tellModel) this.publish(this.model.id, 'setFollowing', { viewId: this.viewId, isFollowing: true }); // to model
        this.follow(presenterId);
    }

    presentationStopped() {
        this.leavePresentation( /* tellModel = */ false); // model already knows
    }

    leavePresentation(tellModel) {
        // sent either locally - by user choosing "Leave Presentation" from the sharing
        // menu - or as a result of the TransformModel deciding that there is no longer
        // a presentation to follow (in which case getPresenter will return null).
        let presenterId = this.getPresenter();
        if (presenterId === this.viewId) {
            console.warn(`cannot leave own presentation`);
            return;
        }
        if (presenterId) {
            console.log(`leaving presentation by ${presenterId}`);
            if (tellModel) {
                this.publish(this.model.id, 'setFollowing', { viewId: this.viewId, isFollowing: false });
            }
        } else {
            // presentation has ended.  in case it was this view that
            // was presenting, clear the presentation button's selected
            // state (harmless if it wasn't set).

            // hack - accessing a pure view-side object
            let presentationButtonDom = document.getElementById("presentationButton");
            presentationButtonDom.classList.remove("app-selected");
        }
        this.unfollow();
    }

    follow(viewId) {
        this.following = viewId;
        this.adjustToFollowedViewport();

        let name = this.scaler.call("PasteUpView", "getUserInitials", viewId);
        this.setPresenterString(`USER "${name}" IS PRESENTING`, "#ef4b3e");
        this.requestToolsHidden(true);
        this.publish(this.sessionId, "followingChanged", viewId);
    }

    unfollow() {
        this.following = null;
        // let followButton = window.topView.querySelector("#followButton");
        // followButton.call("ButtonView", "setButtonLabel", "Follow", "black");
        let canv = this.followCanvas;
        // eslint-disable-next-line no-self-assign
        canv.width = canv.width; // clear
        this.setPresenterString("");
        this.requestToolsHidden(false);
        this.publish(this.sessionId, "followingChanged", null);
        this.publishViewport();
    }

    setPresenterString(str, color) {
        if (!this.presenterString) {
            this.presenterString = this.dom.parentNode.parentNode.querySelector("#presenterString");
        }
        if (this.presenterString) {
            if (color) this.presenterString.style.color = color;
            this.presenterString.innerHTML = str;
        }
    }

    requestToolsHidden(bool) {
        let toolsTab = window.topView.querySelector("#toolsTab");
        if (toolsTab) toolsTab.call("ToolsTabView", "requestToolsHidden", bool);

        let title = window.topView.querySelector("#boardTitle");
        if (title) title.call("TitleView", "requestToolsHidden", bool);
    }

    pointerDown(evt) {
        // console.log("TransformView.pointerDown", evt);
        if (evt.buttons !== 1) {return;}
        if (evt.target.key !== this.scaler.dom.key) {return;}
        // if (this.following) {
        //     this.unfollow();
        // }

        evt.preventDefault();
        evt.stopPropagation();

        evt = this.cookEvent(evt);

        this.evCache.push(evt);

        if (evt.type === "pointerdown" && evt.isPrimary) {
            this.addEventListener("pointermove", "pointerMove");
            this.addEventListener("pointerup", "pointerUp");
            this.addEventListener("pointercancel", "pointerUp");
            this.addEventListener("pointerleave", "pointerUp");
            this.addEventListener("lostpointercapture", "pointerLost");

            this.setPointerCapture(evt.pointerId);

            let translation = this.scaler.currentTranslation;
            let zoom = this.scaler.currentZoom;
            // find the drag-point's coordinates on the unscaled scaler
            let thisRect = this.dom.getBoundingClientRect();
            let dragPointX = (translation.x + evt.clientX - thisRect.x) / zoom;
            let dragPointY = (translation.y + evt.clientY - thisRect.y) / zoom;
            this.dragPoint = { x: dragPointX, y: dragPointY };
        }

        if (this.evCache.length === 2) {
            let dx = this.evCache[0].clientX - this.evCache[1].clientX;
            let dy = this.evCache[0].clientY - this.evCache[1].clientY;
            this.origDiff = Math.sqrt(dx * dx + dy * dy);
            this.origZoom = this.scaler.currentZoom;
        }
    }

    pointerMove(evt) {
        // console.log("TransformView.pointerMove", evt);
        // don't let the event propagate to the scaler
        evt.preventDefault();
        evt.stopPropagation();

        evt = this.cookEvent(evt);

        for (let i = 0; i < this.evCache.length; i++) {
            if (evt.pointerId === this.evCache[i].pointerId) {
                this.evCache[i] = evt;
                break;
            }
        }

        if (this.evCache.length === 1) {
            if (this.noDrag) {return;}
            let dragPoint = this.dragPoint;
            let zoom = this.scaler.currentZoom;

            // find new offset from top corner
            let thisRect = this.dom.getBoundingClientRect();
            let offsetX = evt.clientX - thisRect.x;
            let offsetY = evt.clientY - thisRect.y;

            let newTranslationX = dragPoint.x * zoom - offsetX;
            let newTranslationY = dragPoint.y * zoom - offsetY;

            this.setScroll(newTranslationX, newTranslationY, true); // publish
            return;
        }
        if (this.evCache.length === 2) {
            let dx = this.evCache[0].clientX - this.evCache[1].clientX;
            let dy = this.evCache[0].clientY - this.evCache[1].clientY;
            let curDiff = Math.sqrt(dx * dx + dy * dy);
            if (this.origDiff > 0) {
                let desiredZoom = this.origZoom * (curDiff / this.origDiff);
                let cx = dx / 2 + this.evCache[1].clientX;
                let cy = dy / 2 + this.evCache[1].clientY;
                this.zoomAboutPoint(desiredZoom, cx, cy);
            }
        }
    }

    pointerUp(evt) {
        // console.log("TransformView.pointerUp", evt);
        let oldLen = this.evCache.length;
        for (let i = 0; i < this.evCache.length; i++) {
            if (this.evCache[i].pointerId === evt.pointerId) {
                this.evCache.splice(i, 1);
                break;
            }
        }

        if (this.evCache.length < 2) {
            this.origDiff = -1;
        }

        if (this.evCache.length === 0) {
            this.releaseAllPointerCapture();
            this.noDrag = false;
            this.removeEventListener("pointermove", "pointerMove");
            this.removeEventListener("pointerup", "pointerUp");
            this.removeEventListener("pointercancel", "pointerUp");
            this.removeEventListener("pointerleave", "pointerUp");
            this.removeEventListener("lostpointercapture", "pointerLost");
        }

        if (oldLen === 2 && this.evCache.length === 1) {
            this.noDrag = true;
        }
    }

    pointerLost(evt) {
        this.evCache = [];
        this.pointerUp(evt);
    }

    wheel(evt) {
        evt.preventDefault();
        evt.stopPropagation();
        // if (this.following) {
        //    this.unfollow();
        // }

        // throttle to a max of 30 events per second
        const now = Date.now();
        if (this.lastWheel && now - this.lastWheel < 33) {return;}
        this.lastWheel = now;

        // try to come up with a sensible rate for the change.
        // pinch actions on a trackpad generate very small deltaY
        // values, which we boost to a threshold of 10.
        // but a device that has inertia (e.g., an Apple Magic Mouse)
        // will also generate small values when drifting to a stop;
        // boosting these leads to unnatural jerkiness.
        // we therefore take note of when a large value (> 10) has
        // been received, and if it was within the last two seconds
        // we allow small values to pass through without a boost.
        let deltaY = evt.deltaY;
        let absDeltaY = Math.min(30, Math.abs(deltaY));
        if (absDeltaY > 10) this.lastWheelBurst = now;
        let allowForInertia = this.lastWheelBurst && now - this.lastWheelBurst < 2000;
        if (!allowForInertia) absDeltaY = Math.max(10, absDeltaY);
        let diff = Math.sign(deltaY) * absDeltaY;

        let zoom = this.scaler.currentZoom;
        let desiredZoom = zoom * (1 - diff / 200);

        let thisRect = this.dom.getBoundingClientRect();
        let fixedX = evt.clientX - thisRect.x;
        let fixedY = evt.clientY - thisRect.y;

        this.zoomAboutPoint(desiredZoom, fixedX, fixedY);
    }

    constrainedZoom(desiredZoom) {
        let sWidth = this.scaler.model._get("boardWidth");
        let sHeight = this.scaler.model._get("boardHeight");
        let rect = this.dom.getBoundingClientRect();

        let newZoom = Math.min(desiredZoom, 16); // arbitrary choice;
        newZoom = Math.max(newZoom, rect.width / sWidth, rect.height / sHeight);

        return newZoom;
    }

    deletePointer(viewId) {
        window.topView.pluggableDispatch("pointerTracker", "deletePointer", viewId);
    }

    pointerMoved(info) {
        // handle a pointerMoved event from the TransformModel, or a call from
        // updateAllPointers.
        window.topView.pluggableDispatch("pointerTracker", "pointerMoved", info);
    }

    updateAllPointers() {
        let viewRecords = this.model._get("clientViewRecords");
        Object.keys(viewRecords).forEach(viewId => {
            let record = viewRecords[viewId];
            if (record.lastPointer) this.pointerMoved({viewId, ...record.lastPointer});
        });
    }

    viewportChanged(data) {
        if (data.viewId === this.viewId) return;

        if (data.viewId === this.following) this.adjustToFollowedViewport();
    }

    adjustToFollowedViewport(isLocal = false) {
        if (!this.following) return;
        let clientViewRecords = this.model._get("clientViewRecords");
        if (!clientViewRecords) return;
        let record = clientViewRecords[this.following];
        if (!record) return;
        let scalerRect = record.lastViewport;
        if (!scalerRect) return;

        // in general, moving to follow a remote presenter should
        // not invalidate this user's viewport-restore record.
        // isLocal is true iff this was a locally triggered move (by
        // pressing the recenter button), which *should* therefore
        // allow the record to be removed as usual by setScroll.
        let restoreSpecBackup = this.viewportRestoreSpec;
        let rect = this.dom.getBoundingClientRect();
        let { zoom: newZoom, translation: newTranslation } = this.setViewportToRect(scalerRect, false); // don't publish
        if (!isLocal) this.viewportRestoreSpec = restoreSpecBackup;

        // display a mask to show the region being seen by the followee
        let canv = this.followCanvas;
        // eslint-disable-next-line no-self-assign
        canv.width = canv.width; // clear
        let ctx = canv.getContext("2d");

        let fcWidth = this.followCanvasWidth;
        let fcHeight = this.followCanvasHeight;

        // stackoverflow.com/questions/13618844/polygon-with-a-hole-in-the-middle-with-html5s-canvas
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.rect(0, 0, fcWidth, fcHeight); // outer

        let innerLeft = Math.max(0, (scalerRect.x * newZoom - newTranslation.x) / rect.width * fcWidth);
        let innerTop = Math.max(0, (scalerRect.y * newZoom - newTranslation.y) / rect.height * fcHeight);
        let innerWidth = Math.min(fcWidth - innerLeft, scalerRect.width * newZoom / rect.width * fcWidth);
        let innerHeight = Math.min(fcHeight - innerTop, scalerRect.height * newZoom / rect.height * fcHeight);
        ctx.moveTo(innerLeft, innerTop);
        ctx.rect(innerLeft, innerTop, innerWidth, innerHeight);

        ctx.fillStyle = "black"; // "rgba(150, 150, 150, 0.75)";
        ctx.fill('evenodd');
    }

    setViewportToRect(scalerRect, publish = true) {
        // returns the new zoom and translation settings
        let rect = this.dom.getBoundingClientRect();
        let visibleRect = this.getVisibleClientRect();
        let oldZoom = this.scaler.currentZoom;

        // as far as possible (given the constraints of view sizes)
        // set the local zoom so the remote view just fits within
        // the local visible area, with the remote view's centre
        // coincident with this view's centre.
        let desiredZoom = Math.min(visibleRect.width / scalerRect.width, visibleRect.height / scalerRect.height);
        let newZoom = this.constrainedZoom(desiredZoom);
        if (newZoom !== oldZoom) this.zoom(newZoom);

        // coordinate of the remote view's centre on the unzoomed scaler.
        let centerX = scalerRect.x + scalerRect.width / 2;
        let centerY = scalerRect.y + scalerRect.height / 2;

        // client offset of the centre of the local view
        let clientCenterX = visibleRect.x + visibleRect.width / 2 - rect.x;
        let clientCenterY = visibleRect.y + visibleRect.height / 2 - rect.y;

        // zoomed-scaler origin needed to place the client centre appropriately
        let translationX = centerX * newZoom - clientCenterX;
        let translationY = centerY * newZoom - clientCenterY;

        return { zoom: newZoom, translation: this.setScroll(translationX, translationY, publish) };
    }

    setViewportFromFrame(frameId, scalerRect) {
        let restoreRect = this.getVisibleScalerRect();
        this.setViewportToRect(scalerRect); // also clears any previous viewportRestoreSpec
        this.viewportRestoreSpec = { frameId, scalerRect: restoreRect };
    }

    restoreViewportIfSameFrame(frameId) {
        let spec = this.viewportRestoreSpec; // { frameId, scalerRect }
        if (!spec || spec.frameId !== frameId) return false;

        this.setViewportToRect(spec.scalerRect); // also clears viewportRestoreSpec
        return true;
    }

    clearRestoreViewportIfSameFrame(frameId) {
        let spec = this.viewportRestoreSpec; // { frameId, scalerRect }
        if (!spec || spec.frameId !== frameId) return;

        this.viewportRestoreSpec = null;
    }

    urlFromTemplate(urlTemplate) {
        let SaverClass = this.model.getLibrary("boards.PasteUpSaver3");
        let saver = new SaverClass();
        return saver.urlFromTemplate(urlTemplate);
    }

    toolButtonPressed(data) {
        let { name, url, menu, appInfo, buttonClientRect } = data;

        // de-select if null name, or a plain click (i.e., with no
        // supplied url) on the button that's already selected.
        if (name === null) {
            this.resetToolState();
            return;
        }

        let cover = window.topView.querySelector("#cover");

        let prevSelected = (this.toolState && this.toolState.selected) ? this.toolState.name : null;
        if (!menu && !url && prevSelected === name) {
            cover.call("CoverView", "cancelRubberBanding");
            this.setToolState({ name }); // interacted with, but no longer selected
            return;
        }

        // make sure there's no lingering menu, however it was created.
        // if there was a favourites menu, the dismissal will (synchronously)
        // invoke resetToolState.
        // if it was a dummy menu, remove it without running its onDismiss -
        // because even a dummy menu's onDismiss will reset tool state,
        // including removing any secondary buttons, and maybe it's a
        // secondary button that has been pressed here.
        // if there is a pending update to the tool view itself, don't
        // allow resetToolState to act on it yet if we're about to put up
        // another menu.
        let overrideUpdate = this.hasPendingAppsUpdate && menu;
        if (overrideUpdate) this.hasPendingAppsUpdate = false;
        cover.call("CoverView", "menuUp", true); // true => no onDismiss of dummy
        if (overrideUpdate) this.hasPendingAppsUpdate = true;

        // if a menu has been supplied, clear any rubber-banding and
        // start the menu.
        // if menu is a dummy, the cover will just activate itself
        // to watch for escape and clicks.
        if (menu) {
            let showingMenu = menu.dummy ? "dummy" : true;
            this.setToolState({ name, showingMenu });
            cover.call("CoverView", "cancelRubberBanding");
            let menuOnDismiss = menu.onDismiss; // if any
            menu.onDismiss = () => {
                if (menuOnDismiss) menuOnDismiss();
                this.resetToolState();
            };
            cover.call("CoverView", "addMenu", { menu });
            return;
        }

        if (!url && appInfo && appInfo.urlTemplate) {
            url = appInfo ? this.urlFromTemplate(appInfo.urlTemplate) : "";
        }

        this.setToolState({ name, selected: true, url, appInfo });
        cover.padView = this;
        cover.call("CoverView", "startRubberBanding", buttonClientRect, name);
        cover.call("CoverView", "setPointer");
    }

    setToolState(state) {
        this.toolState = state;
        this.publish(this.sessionId, "updatedToolState", state);
    }

    resetToolState() {
        let cover = window.topView.querySelector("#cover");
        cover.padView = this;
        cover.call("CoverView", "cancelRubberBanding");
        cover.call("CoverView", "menuUp");
        cover.call("CoverView", "setPointer");
        this.setToolState(null);
        if (this.hasPendingAppsUpdate) {
            this.hasPendingAppsUpdate = false;
            this.publish(this.sessionId, "appsChanged");
        }
    }

    userAppsChanged() {
        // PasteUpView has announced a change to userApps.
        // as for sessionAppUpdated below, propagation to
        // the app manager should be delayed if the change
        // could disrupt an in-progress favourites operation.
        if (this.toolState && this.toolState.showingMenu) {
            // likely to disrupt.  postpone.
            this.hasPendingAppsUpdate = true;
            return;
        }

        this.publish(this.sessionId, "appsChanged");
    }

    sessionAppUpdated(appName) {
        // PasteUpModel has announced a change to the named
        // app (signalling its addition to or removal from
        // the session apps).
        // if the user is working with the apps/favourites -
        // in particular, with the favourites menus - we don't
        // want to suddenly change the number (and hence layout)
        // of the apps.  the update should be postponed until
        // the user puts the menu away.
        // however, if the app being updated also appears in
        // the PasteUpView's user-apps list, this update will
        // not cause any change in the number of apps anyway,
        // and can go ahead.
        let scaler = window.topView.querySelector("#scaler");
        let userApps = scaler.call("PasteUpView", "getUserApps");
        if (!userApps[appName] && this.toolState && this.toolState.showingMenu) {
            // likely to disrupt.  postpone.
            this.hasPendingAppsUpdate = true;
            return;
        }

        this.publish(this.sessionId, "appsChanged");
    }

    favoritesChanged(appName) {
        // if appName is specified, only forward an announcement
        // if the user is currently showing a favourites menu for
        // the affected app.  if the user is in the process of editing
        // an item in the menu, the tool button will ignore the
        // announcement.
        if (!this.toolState) return; // clearly, no menu showing

        let { name, showingMenu } = this.toolState;
        if (showingMenu !== true || (appName && name !== appName)) return;
        this.publish(this.sessionId, "toolFavoritesChanged", appName);
    }

    createObjectInRect(unscaledRect) {
        let { name, url, appInfo } = this.toolState;
        let { x, y, width, height } = unscaledRect;
        let obj = { x, y, width, height, viewId: this.viewId, type: name, url, appInfo };
        if (name === "text") {
            this.publish(this.model.id, "newText", obj);
        } else {
            this.publish(this.model.id, "newIFrame", obj);
        }
    }

    scroll(_evt) {
        if (!this.scaler) {return;} // during construction
        let translation = this.scaler.currentTranslation;
        let scrollLeft = Math.round(this.dom.scrollLeft);
        if (Math.abs(scrollLeft - translation.x) > 1) {
            // console.log(`fix scroll x: ${scrollLeft} to ${translation.x}`);
            this.dom.scrollLeft = translation.x;
        }
        let scrollTop = Math.round(this.dom.scrollTop);
        if (Math.abs(scrollTop - translation.y) > 1) {
            // console.log(`fix scroll y: ${scrollTop} to ${translation.y}`);
            this.dom.scrollTop = translation.y;
        }
    }

    setScroll(x, y, publish) {
        let zoom = this.scaler.currentZoom;
        let thisRect = this.dom.getBoundingClientRect();

        // ensure that neither the top left nor bottom right corners
        // are outside the scaler limits (it's the caller's responsibility
        // to ensure that the zoom is suitable for the client size).
        if (x < 0) x = 0;
        else x = Math.min(x, this.scaler.model._get("boardWidth") * zoom - thisRect.width);

        if (y < 0) y = 0;
        else y = Math.min(y, this.scaler.model._get("boardHeight") * zoom - thisRect.height);

        // round, because the scroll properties only deal in integers (and floor/ceil
        // would introduce a cumulative bias)
        x = Math.round(x);
        y = Math.round(y);

        this.scaler.currentTranslation = { x, y };

        this.dom.scrollLeft = x;
        this.dom.scrollTop = y;

        if (publish) {
            window.topView.throttledInvoke("publishViewport", this.scaler.throttleBaseMS * 3, () => this.publishViewport());
        }

        this.updateAllPointers();

        this.viewportRestoreSpec = null;

        this.publish(this.sessionId, "annotationCleanAndDraw");
        return { x, y };
    }

    publishViewport() {
        let rect = this.getVisibleScalerRect();
        let { x, y, width, height } = rect;
        let truncated = { x: x | 0, y: y | 0, width: width | 0, height: height | 0 };
        this.publish(this.model.id, "viewport", { viewId: this.viewId, scalerRect: truncated });
    }

    zoom(z) {
        this.scaler.currentZoom = z;
        let prop = this.scaler.dom.style.getPropertyValue("transform");
        if (!prop) return;

        let matrix = prop.split(", ");
        if (matrix[0].startsWith("matrix(")) {
            matrix[0] = matrix[0].slice(7);
        }
        if (matrix[5].endsWith(")")) {
            matrix[5] = matrix[5].slice(0, matrix[5].length - 1);
        }
        let m = matrix.map(v => parseFloat(v));

        m[0] = z;
        m[3] = z;

        let newProp = `matrix(${m.join(", ")})`;
        this.scaler.dom.style.setProperty("transform", newProp);

        let scaleReadout = window.topView.querySelector("#scaleReadout");
        if (scaleReadout) {
            scaleReadout.call("ScaleReadOutView", "showScale", z);
        }

        let cover = window.topView.querySelector("#cover");
        cover.call("CoverView", "zoomUpdated");

        // force this element to take account of the change in size of the child.
        // on Safari, not doing this before setting the position (with scrollLeft
        // and scrollTop) appears to cause the browser to fail to notice that
        // scrollWidth needs recomputing.
        // sept 2020: additional step, to fix a further problem in Safari's
        // calculation of scrollWidth: it seems that if any descendant element has
        // position="fixed", scrollWidth isn't being updated.  we can make sure
        // that's not true for q's own objects, but iframes can have arbitrary
        // contents.  therefore temporarily remove iframes from the display tree
        // while scrollWidth is recalculated.
        let frames = Array.from(this.dom.querySelectorAll("iframe")).map(f => [f, f.style.display]);
        frames.forEach(([f, _]) => f.style.display = "none");

        // eslint-disable-next-line no-unused-expressions
        this.dom.scrollWidth;

        frames.forEach(([f, d]) => f.style.display = d);

        let rect = this.dom.getBoundingClientRect();
        this.publish(this.sessionId, "annotationResizeAndDraw", rect.width, rect.height);
    }

    annotationDone() {
        this.isDrawing = false;
        let button = window.topView.querySelector("#annotationButton");
        if (button) {
            button.call("AnnotationButtonView", "setActive", false);
        }
    }

    annotationButtonPressed() {
        if (this.isDrawing) {
            this.isDrawing = false;
            this.stopAnnotationDrawing(true);
            return;
        }
        this.isDrawing = true;
        this.startAnnotationDrawing();
    }

    startAnnotationDrawing() {
        if (!this.scaler) {return;}
        let userInfo = this.scaler.call("PasteUpView", "getUserInfo", this.viewId);
        let color = userInfo.userColor || "#00FF00";

        let annotation = this.parentNode.querySelector("#annotation-canvas");
        if (annotation) {
            annotation.call("DrawView", "localActivate", color);
        }

        let button = window.topView.querySelector("#annotationButton");
        if (button) {
            button.call("AnnotationButtonView", "setActive", true, color);
        }
    }

    stopAnnotationDrawing() {
        let annotation = this.parentNode.querySelector("#annotation-canvas");
        if (annotation) {
            annotation.call("DrawView", "localDeactivate");
        }

        let button = window.topView.querySelector("#annotationButton");
        if (button) {
            button.call("AnnotationButtonView", "setActive", false);
        }
    }
}

class CoverView {
    init() {
        this.addEventListener("pointerdown", "pointerDown");
        this.addEventListener("pointermove", "pointerMove");
        this.addEventListener("wheel", "wheel");
        this.dom.setAttribute("tabindex", "-1"); // to be able to listen to keyboard events
        console.log("CoverView.init");
    }

    activate() {
        this.addEventListener("keydown", "keyDown");
        this.dom.style.removeProperty("display");
        this.dom.focus();
    }

    deactivate() {
        this.dom.blur();
        this.dom.style.setProperty("display", "none");
        this.removeEventListener("keydown", "keyDown");
    }

    ensureScaler() {
        if (!this.scaler) {
            this.scaler = window.topView.querySelector("#scaler");
        }
        return this.scaler;
    }

    setPointer() {
        // set the image to be used by the hardware cursor when over this element,
        // by copying from the scaler.

        // if (this.dom.style.getPropertyValue("cursor")) {return;}
        this.ensureScaler();
        this.dom.style.setProperty("cursor", this.scaler.dom.style.getPropertyValue("cursor"));
    }

    pointerMove(evt) {
        // console.log("CoverView.pointerMove", evt);
        evt.preventDefault();
        // evt.stopPropagation();

        this.ensureScaler();
        this.scaler.call("PasteUpView", "pointerMove", evt, true);
    }

    pointerDown(evt) {
        if (evt.buttons !== 1) {return;}

        evt.preventDefault();
        evt.stopPropagation();

        if (this.rubber) this.newObjectDown(evt);
        else this.menuUp();
    }

    wheel(evt) {
        evt.preventDefault();
        evt.stopPropagation();

        if (!this.pad) {
            this.pad = window.topView.querySelector("#pad");
        }
        this.pad.call("TransformView", "wheel", evt);
    }

    newObjectDown(evt) {
        if (evt.buttons !== 1) {return;}
        this.setPointerCapture(evt.pointerId);

        let rect = this.dom.getBoundingClientRect();
        let x = evt.clientX - rect.x;
        let y = evt.clientY - rect.y;

        this.rubberBandingInfo.originX = x;
        this.rubberBandingInfo.originY = y;

        this.addEventListener("pointerup", "newObjectUp");
        this.addEventListener("lostpointercapture", "resetToolState");
    }

    newObjectMove(evt) {
        let rect = this.dom.getBoundingClientRect();
        let x = evt.clientX - rect.x;
        let y = evt.clientY - rect.y;

        // if corner has already been placed, use current
        // x and y to adjust the width.
        let rubber = this.rubber;
        if (this.rubberBandingInfo.originX !== undefined) {
            let { originX, originY } = this.rubberBandingInfo;
            let width = x - originX;
            let height = y - originY;

            // don't assign/update dragWidth & dragHeight until they are both
            // at least 10px from origin
            if (Math.abs(width) < 10 && Math.abs(height) < 10) return;

            if (width < 0) {
                width = -width;
            } else {
                x = originX;
            }

            if (height < 0) {
                height = -height;
            } else {
                y = originY;
            }

            // scaleRubberForZoom will constrain the dragged size
            // from going below the minimum allowed extent
            this.rubberBandingInfo.dragWidth = width;
            this.rubberBandingInfo.dragHeight = height;
            this.scaleRubberForZoom();
        }

        rubber.style.setProperty("left", x + "px");
        rubber.style.setProperty("top", y + "px");
        rubber.style.setProperty("opacity", "0.2");
    }

    newObjectLeave(_evt) {
        // handle pointer leaving the cover area while rubber-banding
        this.releaseAllPointerCapture();
        if (this.rubber) this.rubber.style.setProperty("opacity", "0");
    }

    newObjectUp(_evt) {
        this.releaseAllPointerCapture();
        this.removeEventListener("pointerup", "newObjectUp");

        // originX, Y are in scaled coords; width and height are already unscaled,
        // and already constrained to the minimum extent
        let { originX, originY, width, height } = this.rubberBandingInfo;
        let translation = this.scaler.currentTranslation;
        let zoom = this.scaler.currentZoom;
        let x = (originX + translation.x) / zoom;
        let y = (originY + translation.y) / zoom;
        let unscaledRect = { x, y, width, height };
        this.padView.call("TransformView", "createObjectInRect", unscaledRect);
        this.padView.call("TransformView", "resetToolState");
    }

    startRubberBanding(buttonClientRect, appName) {
        let defaultWidth, defaultHeight;
        if (appName === "text") {
            defaultWidth = 300;
            defaultHeight = 250;
        } else {
            defaultWidth = 600;
            defaultHeight = 500;
        }
        this.ensureScaler();
        let minObjectExtent = this.scaler.model.call("PasteUpModel", "getMinObjectExtent");
        this.rubberBandingInfo = { minWidth: minObjectExtent.x, minHeight: minObjectExtent.y, width: defaultWidth, height: defaultHeight };

        if (!this.rubber) {
            // before the user starts a size-defining drag, the size of the
            // rubber-band zone is determined by the default size of the
            // kind of app being defined (text or otherwise), as it would
            // appear given the room's current zoom.  if the zoom changes,
            // the zone's size changes accordingly.
            let rubber = this.rubber = document.createElement("div");
            rubber.style.setProperty("position", "absolute");
            rubber.style.setProperty("background-color", "#99999999");
            rubber.style.setProperty("pointer-events", "none");
            this.dom.appendChild(rubber);

            this.addEventListener("pointermove", "newObjectMove");
            this.addEventListener("pointerenter", "newObjectMove");
            this.addEventListener("pointerleave", "newObjectLeave");

            this.activate();
        } else {
            // don't go through the full activation, but at least
            // make sure the cover has the keyboard focus.
            this.dom.focus();
        }

        this.rubber.style.setProperty("top", `${buttonClientRect.top + 25}px`);
        this.rubber.style.setProperty("left", `${buttonClientRect.right + 25}px`);
        this.rubber.style.setProperty("opacity", "0.2");
        this.scaleRubberForZoom();
    }

    scaleRubberForZoom() {
        let zoom = this.scaler.currentZoom;

        // while in the middle of a drag, force the extent of the
        // implied (unscaled) rectangle to be at least the minimum
        if (this.rubberBandingInfo.dragWidth !== undefined) {
            let { dragWidth, dragHeight, minWidth, minHeight } = this.rubberBandingInfo;
            this.rubberBandingInfo.width = Math.max(dragWidth / zoom, minWidth);
            this.rubberBandingInfo.height = Math.max(dragHeight / zoom, minHeight);
        }

        let { width, height } = this.rubberBandingInfo;
        this.rubber.style.setProperty("width", `${width * zoom}px`);
        this.rubber.style.setProperty("height", `${height * zoom}px`);
    }

    zoomUpdated() {
        if (this.rubber) this.scaleRubberForZoom();
    }

    resetToolState() {
        this.padView.call("TransformView", "resetToolState");
    }

    keyDown(evt) {
        evt.preventDefault();
        if (evt.key === "Escape") this.resetToolState();
    }

    cancelRubberBanding() {
        if (this.rubber) {
            delete this.rubberBandingInfo;
            this.rubber.remove();
            this.rubber = null;
            this.removeEventListener("pointermove", "newObjectMove");
            this.removeEventListener("pointerenter", "newObjectMove");
            this.removeEventListener("pointerleave", "newObjectLeave");

            // when newObjectDown was already called
            this.removeEventListener("lostpointercapture", "resetToolState");

            this.deactivate();
        }
    }

    addMenu(options) {
        this.menuUp(); // clear any existing menu (and run its dismiss handler, if any)

        let {menu, placeElement, position} = options;

        this.addEventListener("click", "menuUp");
        this.activate();

        this.menu = menu;

        let middle = window.topView.querySelector("#middle");
        middle.call("MiddleView", "enablePointerMoveHandler");

        // a dummy menu just causes cover activation, so we can trap
        // a click or escape.
        if (menu.dummy) return;

        // add menu under "middle" as a sibling of pad and cover, to allow the z-indices
        // to work as intended.
        middle.dom.appendChild(menu);

        let mRect = menu.getBoundingClientRect();

        menu.style.setProperty("z-index", "10000030"); // in front of tools

        if (placeElement) { // optional element that we'll put the menu next to
            let rect = placeElement.dom.getBoundingClientRect();
            let sRect = this.dom.getBoundingClientRect();

            let x;
            let y;
            if (position === "center") {
                x = rect.width / 2 + rect.left - sRect.left;
                x -= mRect.width / 2;
                y = rect.bottom - sRect.top;
            } else if (position === "bottomRight") {
                x = rect.left - mRect.width;
                menu.style.setProperty("position", "absolute");
                menu.style.setProperty("left", (x - 15) + "px");
                menu.style.setProperty("bottom", 32 + "px");
                return;
            } else if (position === "bottomLeft") {
                x = rect.right;
                menu.style.setProperty("position", "absolute");
                menu.style.setProperty("left", (x + 15) + "px");
                menu.style.setProperty("bottom", 24 + "px");
                return;
            } else if (position === "present") {
                x = rect.left - sRect.left - 10;
                x -= mRect.width;
                y = rect.bottom - mRect.height;
            } else if (position === "centerLeft") {
                x = rect.width + rect.left;
                y = rect.bottom - sRect.top;
            } else {
                x = rect.right - sRect.left;
                y = rect.y - sRect.top;
            }

            menu.style.setProperty("position", "absolute");
            menu.style.setProperty("left", (x + 5) + "px");
            menu.style.setProperty("top", (y + 0) + "px");
        }
    }

    // invoked when menu is no longer needed - either because user
    // clicked elsewhere, or selected a menu item, or is starting
    // a new menu.
    menuUp(noDismissIfDummy = false) {
        if (this.menu) {
            let menu = this.menu;
            this.menu = null; // before running any onDismiss code

            this.removeEventListener("click", "menuUp"); // if set

            let isDummy = !!menu.dummy;
            if (menu.onDismiss && !(isDummy && noDismissIfDummy)) menu.onDismiss();
            if (!isDummy) menu.remove();

            let middle = window.topView.querySelector("#middle");
            middle.call("MiddleView", "disablePointerMoveHandler");
            this.deactivate();
        }
    }
}

class PasteUpModel {
    init() {
        // this.subscribe(this.id, "addAsset", "PasteUpModel.addAsset");
        // this.subscribe(this.id, "addImage", "PasteUpModel.addImage");
        // this.subscribe(this.id, "addURL", "PasteUpModel.addURL");
        // this.subscribe(this.id, "addPDF", "PasteUpModel.addPDF");

        this.subscribe(this.sessionId, "triggerPersist", "triggerPersist");

        this.subscribe(this.sessionId, "trashObject", "trashObject");
        this.subscribe(this.sessionId, "copyObject", "copyObject");
        this.subscribe(this.sessionId, "moveObjectEdges", "moveObjectEdges");
        this.subscribe(this.sessionId, "resizeOrMoveEnd", "resizeOrMoveEnd");
        this.subscribe(this.sessionId, "moveAndResizeObject", "moveAndResizeObject");
        this.subscribe(this.sessionId, "returnToPreviousState", "returnToPreviousState");
        this.subscribe(this.sessionId, "bringToFront", "bringToFront");
        this.subscribe(this.sessionId, "sendToBack", "sendToBack");
        this.subscribe(this.sessionId, "setFrameBorder", "setFrameBorder");
        this.subscribe(this.sessionId, "setLockFrame", "setLockFrame");
        this.subscribe(this.sessionId, "openWorkspace", "openWorkspace");

        this.subscribe(this.id, "setSessionFavorite", "setSessionFavorite");

        this.subscribe(this.id, "startScripting", "startScripting");

        this.subscribe(this.id, "setUserInfo", "setUserInfo");

        this.subscribe(this.sessionId, "view-join", "addUser");
        this.subscribe(this.sessionId, "view-exit", "deleteUser");

        // this.subscribe(this.id, 'saveRequest', 'save');
        this.subscribe(this.id, "loadContents", "loadDuplicate");

        this.subscribe(this.sessionId, "setBackground", "setBackground");

        this.ensureUserInfo();
        this.ensureLayers();
        this.ensureSessionApps();
        this.ensureSessionUtilities();
        this.ensureSessionFavorites();
        this.ensurePersistenceProps();

        this.ensureScriptors();

        console.log("PasteUpModel.init");
    }

    ensureUserInfo() {
        if (!this._get("userInfo")) {
            this._set("userInfo", {});
        }
        return this._get("userInfo");
    }

    ensureLayers() {
        if (!this._get("layers")) {
            this._set("layers", []);
        }
        return this._get("layers");
    }

    // sept 2020: sessionFavorites is now (like wallet favorites) keyed
    // by url, with each entry having { appInfo, faveName }
    ensureSessionFavorites() {
        if (!this._get("sessionFavorites")) {
            this._set("sessionFavorites", {});
        }
        return this._get("sessionFavorites");
    }

    ensureSessionApps() {
        let create = false;
        let old = this._get("sessionApps");
        let check = () => {
            if (!old) {
                create = true;
                return;
            }
            let keys = Object.keys(old);
            if (keys.length === 0) {
                create = true;
                return;
            }
            let first = old[keys[0]];
            if (!first.order) {
                create = true;
            }
        };

        check();

        if (create) {
            // nov 2020: for now, the set of app buttons is fixed.
            let appDefs = {
                link: {
                    label: "web page", iconName: "link.svgIcon",
                    urlTemplate: "../cobrowser-single/?q=${q}", order: 10,
                    noURLEdit: true,
                    noSandbox: true,
                    pressHold: {
                        appName: "link:secondary", label: "custom app", iconName: "link.svgIcon",
                        urlTemplate: null, order: 1
                    }
                },
                // googleworkspace: {
                //     iconName: "googleworkspace.svgIcon",
                //     viewBox: [376, 177], urlTemplate: null, order: 15,
                // },
                docview: {
                    label: "document", iconName: "pdf.svgIcon",
                    urlTemplate: "../docview/?q=${q}", order: 20
                },
                pix: {
                    label: "pictures", iconName: "addimg.svgIcon",
                    urlTemplate: "../pix/?q=${q}", order: 30
                },
                text: {
                    label: "notes", iconName: "text-fields.svgIcon",
                    urlTemplate: "../text/apps/?q=${q}", order: 40
                },
                whiteboard: {
                    label: "whiteboard", iconName: "whiteboard.svgIcon",
                    urlTemplate: "../whiteboard/?q=${q}", order: 50
                },
                sharescreen: {
                    label: "share screen", iconName: "share-screen.svgIcon",
                    urlTemplate: "../share-screen/?q=${q}", order: 60
                },
                youtube: {
                    label: "youtube", iconName: "youtube.svgIcon",
                    urlTemplate: "../youtube/?q=${q}", order: 70
                },
            };
            this._set("sessionApps", appDefs);
        }
        return this._get("sessionApps");
    }

    ensureSessionUtilities() {
        if (!this._get("sessionUtilities")) {
            let toolDefs = {
                /*
                divider: {
                    label: "-", iconName: null, buttonClass: null, order: 0 },
                */
                file: {
                    label: "upload file",
                    iconName: "upload.svgIcon",
                    buttonClass: "FileButtonClass",
                    order: 10
                },
            };
            this._set("sessionUtilities", toolDefs);
        }
        return this._get("sessionUtilities");
    }

    ensurePersistenceProps() {
        if (!this._get("persistPeriod")) {
            let period = 1 * 60 * 1000;
            this._set("persistPeriod", period);
        }
        if (this._get("lastPersistTime") === undefined) {
            this._set("lastPersistTime", 0);
        }

        if (this._get("persistRequested") === undefined) {
            this._get("persistRequested", false);
        }
    }

    ensureScriptors() {
        if (!this._get("scriptors")) {
            this._set("scriptors", {});
        }
        return this._get("scriptors");
    }

    chooseNewUserColor(numColors) {
        // create an array tallying existing assignment of colour
        // indices.  start by filling the array with the maximum
        // count each colour can have - for example, if there are
        // four available colours and there are six users, each
        // colour can have been used a maximum of two times.
        // ...except that, through the luck of joins and leaves,
        // this theoretical maximum *can* be exceeded (e.g., ten
        // users reducing to two, that happen to be the same colour).
        let userInfo = this._get("userInfo");
        let numUsers = Object.keys(userInfo).length + 1; // because we're about to add one
        let maxTally = Math.ceil(numUsers / numColors);
        let colorCands = new Array(numColors).fill(maxTally);
        Object.values(userInfo).forEach(record => {
            let colorIndex = record.userColorIndex;
            if (colorIndex !== undefined) colorCands[colorIndex]--;
        });
        // now gather the indices that have been used fewer than
        // the (theoretical) maximum number of times.  those are
        // the remaining candidates.
        let remainingCands = [];
        colorCands.forEach((tally, colorIndex) => { if (tally > 0) remainingCands.push(colorIndex); });
        // and pick one of those at random.  Replicated random.
        let colorChoice = remainingCands[Math.floor(Math.random() * remainingCands.length)];
        return colorChoice;
    }
    setUserInfo(info) {
        // update the record in "userInfo" for the user with the supplied viewId

        let { viewId, sessionName, ...recordUpdate } = info; // recordUpdate is a copy without the viewId
        this._set("sessionName", sessionName);

        // hack to prevent the local test view from storing its info
        if (viewId.startsWith("viewDomain")) {return;}

        if (!recordUpdate.userColor) {
            let colors = ["#1378a5", "#c71f3c", "#2f4858", "#6a3d9a", "#333F91", "#2ba249", "#275B33", "#cc7025", "#f15a3a", "#901940", "#3b0f30"];
            let colorIndex = this.chooseNewUserColor(colors.length);
            recordUpdate.userColorIndex = colorIndex;
            recordUpdate.userColor = colors[colorIndex];
        }
        let userInfo = this._get("userInfo");
        let existing = userInfo[viewId] || {};
        let newRecord = {...existing, ...recordUpdate}; // merge update into existing record, if any
        userInfo = {...userInfo, ...{[viewId]: newRecord}}; // and merge record into new userInfo
        this._set("userInfo", userInfo);
        this.publish(this.sessionId, "userCursorUpdated", viewId);
        this.publish(this.id, "userInfoChanged");
    }

    addUser(_viewId) {
    }

    deleteUser(viewId) {
        let userInfo = this._get("userInfo");
        let newValue = {...userInfo };
        delete newValue[viewId];
        this._set("userInfo", newValue);
        this.publish(this.id, "userInfoChanged");
    }

    trashObject(data) {
        let {target, _viewId} = data;
        if (target) {
            let obj = this.getElement(target);
            if (obj) {
                let layers = this._get("layers").slice();
                let layer = layers.findIndex((elem) => target.equals(elem));
                let origLength = layers.length;
                if (layer >= 0) {
                    layers.splice(layer, 1);
                    for (let i = layer; i < origLength - 1; i++) {
                        let c = this.getElement(layers[i]);
                        c.style.setProperty("z-index", `${i}`);
                    }
                    this._set("layers", layers);
                }
                obj.remove();
                this.publish(this.id, "trashObject", target);
                this.triggerPersist();
            }
        }
    }

    copyObject(data) {
        let {target, _viewId} = data;
        if (target) {
            let obj = this.getElement(target);
            if (obj) {
                let SaverClass = this.getLibrary("boards.PasteUpSaver3");
                let saver = new SaverClass();
                let json = saver.save(this, [obj]);
                let newSet = saver.load(json, this);
                let newOne = newSet[0];
                let t = newOne.getTransform().slice();
                t[4] += 50;
                t[5] += 50;
                newOne.setTransform(t);
                this.addFrame(newOne);
                let newTarget = this.getElement(newOne._get("target"));
                this.comeUpFullyOnReload(newOne, newTarget);
            }
        }
    }

    setFrameBorder(data) {
        let {target, _viewId, flag} = data;
        if (target) {
            let obj = this.getElement(target);
            if (obj) {
                obj._set("showBorder", flag);
                obj.call("FrameModel", "stateChanged");
            }
        }
    }

    setLockFrame(data) {
        let {target, _viewId, flag} = data;
        if (target) {
            let obj = this.getElement(target);
            if (obj) {
                obj._set("locked", flag);
                obj.call("FrameModel", "stateChanged");
            }
        }
    }

    getMinObjectExtent() {
        return { x: 150, y: 85 }; // pad of 50, when frame title height is 35
    }

    moveObjectEdges(info) {
        let { updates: { top, bottom, left, right }, target, viewId: _viewId, frameInfo } = info;

        let targetObj = this.getElement(target);
        if (!targetObj) {
            console.log("target not found", target);
            return;
        }

        let frame = this.getElement(frameInfo);
        if (!frame) {
            console.log("frame not found", frameInfo);
            return;
        }

        // when left or top is specified, it is applied to the
        // offset of the frame.
        // when right or bottom is specified, it is used to adjust
        // the width and height of the embedded "target".

        let t = frame.getTransform().slice();
        let frameLeft = t[4];
        let frameTop = t[5];
        let titleHeight = frame.call("FrameModel", "getTitleHeight");
        let minObjectExtent = this.getMinObjectExtent();
        let minPadExtent = { x: minObjectExtent.x, y: minObjectExtent.y - titleHeight };
        let targetLeft = frameLeft,
            targetTop = frameTop + titleHeight;

        let targetWidth = parseFloat(targetObj.style.getPropertyValue("width"));
        let targetHeight = parseFloat(targetObj.style.getPropertyValue("height"));

        let setTransform = false;

        if (left !== undefined) {
            let targetRight = targetLeft + targetWidth;
            // constrain to min width, bearing in mind that
            // right might be increasing too
            frameLeft = Math.min(left, Math.max(targetRight, right || 0) - minPadExtent.x);
            targetLeft = frameLeft;
            t[4] = frameLeft;
            setTransform = true;
            targetWidth = targetRight - targetLeft;
        }

        if (right !== undefined) {
            let constrainedRight = Math.max(right, targetLeft + minPadExtent.x);
            targetWidth = constrainedRight - targetLeft;
        }

        if (top !== undefined) {
            let targetBottom = targetTop + targetHeight;
            // constrain to min pad height
            frameTop = Math.min(top, Math.max(targetBottom, bottom || 0) - minPadExtent.y - titleHeight);
            targetTop = frameTop + titleHeight;
            t[5] = frameTop;
            setTransform = true;
            targetHeight = targetBottom - targetTop;
        }

        if (bottom !== undefined) {
            let constrainedBottom = Math.max(bottom, targetTop + minPadExtent.y);
            targetHeight = constrainedBottom - targetTop;
        }

        if (setTransform) frame.setTransform(t);

        if (targetObj._get("_useSetExtent")) {
            targetObj.call(...targetObj._get("_useSetExtent"), targetWidth, targetHeight);
        } else {
            targetObj.style.setProperty("width", targetWidth + "px");
            targetObj.style.setProperty("height", targetHeight + "px");
        }
    }

    moveAndResizeObject(info) {
        // new object coordinates specified as x, y, width, height
        // in raw pad coordinates
        let {width, height, x, y, frameInfo, target, _viewId} = info;

        let frame = this.getElement(frameInfo);
        let obj = this.getElement(target);

        if (!obj) {
            console.log("target not found", target);
            return;
        }

        if (!frame) {
            console.flog("frame not found", frameInfo);
            return;
        }

        let t = frame.getTransform().slice();
        t[4] = x;
        t[5] = y;
        frame.setTransform(t);

        width = Math.max(width, 36);
        height = Math.max(height, 36);
        if (obj._get("_useSetExtent")) {
            obj.call(...obj._get("_useSetExtent"), width, height);
        } else {
            obj.style.setProperty("width", width + "px");
            obj.style.setProperty("height", height + "px");
        }
    }

    resizeOrMoveEnd(info) {
        // now that interaction with the object has stopped,
        // adjust its position if needed to bring all corners
        // within the bounds of the board.
        let frameInfo = info.frameInfo;

        let frame = this.getElement(frameInfo);
        if (!frame) {return;}
        let t = frame.getTransform().slice();

        let targetInfo = frame._get("target");
        if (!targetInfo) {return;}
        let target = this.getElement(targetInfo);

        let boardWidth = this._get("boardWidth");
        let boardHeight = this._get("boardHeight");

        let width = target ? parseFloat(target.style.getPropertyValue("width")) : 400;

        if (t[4] < 0) {
            t[4] = 0;
        }
        if (t[4] + width > boardWidth) {
            t[4] = boardWidth - width - 200;
        }
        if (t[5] < 0) {
            t[5] = 0;
        }
        if (t[5] + 200 > boardHeight) {
            t[5] = boardHeight - 200;
        }

        frame.setTransform(t);
        this.triggerPersist();
    }

    returnToPreviousState() {
        let previousState = this._get("previousWindowState");
        if (!previousState) {return;}
        this.moveAndResizeObject(previousState);
    }

    bringToFront(data) {
        let {target, _viewId} = data;
        if (target) {
            let obj = this.getElement(target);
            if (obj) {
                let layers = this._get("layers").slice();
                let layer = layers.findIndex((elem) => target.equals(elem));
                let origLength = layers.length;
                if (layer >= 0) {
                    let elem = layers[layer];
                    layers.splice(layer, 1);
                    for (let i = layer; i < origLength - 1; i++) {
                        let c = this.getElement(layers[i]);
                        c.style.setProperty("z-index", `${i}`);
                    }
                    layers.push(elem);
                    obj.style.setProperty("z-index", `${layers.length - 1}`);
                    this._set("layers", layers);
                    return;
                }
                this.appendChild(obj);
            }
        }
    }

    sendToBack(data) {
        let {target, _viewId} = data;
        if (target) {
            let obj = this.getElement(target);
            if (obj) {
                let layers = this._get("layers").slice();
                let layer = layers.findIndex((elem) => target.equals(elem));
                // let origLength = layers.length;
                if (layer >= 0) {
                    let elem = layers[layer];
                    layers.splice(layer, 1);
                    layers.unshift(elem);
                    obj.style.setProperty("z-index", "0");
                    for (let i = 1; i < layer + 1; i++) {
                        let c = this.getElement(layers[i]);
                        c.style.setProperty("z-index", `${i}`);
                    }
                    this._set("layers", layers);
                    return;
                }
                this.insertFirst(obj);
            }
        }
    }

    setSessionFavorite(data) {
        // console.log("setSessionFavorite", data);

        let favorites = this._get("sessionFavorites");
        // clone, to remove risk of model corruption
        // through old references.
        let newFavorites = {};
        for (let [url, spec] of Object.entries(favorites)) {
            newFavorites[url] = {...spec};
        }

        let changing = true; // assume there will be a change
        let { url, status, appInfo, proposedName } = data;
        let { appName } = appInfo;
        let existing = newFavorites[url];

        // code below is adapted from WalletModel (in wallet.js).

        // handle deletion
        if (!status) {
            delete newFavorites[url];
            changing = !!existing;
        } else {
            // if the spec is the same as what is already recorded,
            // there will be no change.
            if (existing) {
                let { appInfo: { appName: origAppName }, faveName: origFaveName } = existing;
                changing = !(appName === origAppName && proposedName === origFaveName);
            }

            if (changing) {
                // either a new favourite, or changing the name of an
                // existing one.  tweak the name if necessary to ensure
                // no clash with another favourite for the same app.
                let siblingNames = Object.keys(newFavorites)
                    .map(itemUrl => {
                        if (itemUrl === url) return null;
                        let item = newFavorites[itemUrl];
                        return item.appInfo.appName === appName && item.faveName;
                    })
                    .filter(Boolean);
                let text = proposedName;
                let duplicateIndex = 0;
                while (siblingNames.includes(text)) {
                    text = `${proposedName} (${++duplicateIndex})`;
                }
                newFavorites[url] = { appInfo, faveName: text };

                // if this is the first favourite for a given app, add
                // that app to the sessionApps dictionary
                let knownApps = this._get("sessionApps");
                if (!knownApps[appName]) {
                    // again, clone for safety
                    let newApps = {};
                    for (let [name, spec] of Object.entries(knownApps)) {
                        newApps[name] = {...spec};
                    }

                    let { label, iconName, urlTemplate } = appInfo;
                    newApps[appName] = { label, iconName, urlTemplate };

                    this._set("sessionApps", newApps);
                    this.publish(this.sessionId, "sessionAppUpdated", appName);
                }
            }
        }

        this._set("sessionFavorites", newFavorites);
        if (changing) this.publish(this.sessionId, "favoritesChanged", appName);
    }

    addFrame(frame) {
        let layers = [...this._get("layers"), frame.asElementRef()];
        this._set("layers", layers);
        frame.style.setProperty("z-index", `${layers.length - 1}`);
        this.appendChild(frame);
        this.triggerPersist();
    }

    openWorkspace(info, maybeTextFrame) {
        let textFrame = maybeTextFrame || this.newNativeText({x: info.x + 200, y: info.y + 200, width: 400, height: 300});
        let text = textFrame.querySelector("#text");
        this.workspaceAccepted({ref: text.asElementRef(), text: undefined});

        let scriptors = {...this._get("scriptors")};
        scriptors[text.asElementRef().asKey()] = {
            textFrameRef: textFrame.asElementRef(),
        };
        this.subscribe(text.id, "text", "PasteUpModel.workspaceAccepted");
    }

    workspaceAccepted(data) {
        let {ref, text} = data;

        let elem = this.getElement(ref);

        let str = `
class Workspace {
    m() {
        return (${text});
    }
}`.trim();

        elem.addCode(str);
        let result = elem.call("Workspace", "m");
        if (result !== undefined) {
            elem.load([{text: text + "\n" + result}]);
        }
    }

    startScripting(info) {
        let { frameInfo, objectInfo } = info;
        let frame = this.getElement(frameInfo);
        if (!frame) {return;}
        let obj = this.getElement(objectInfo);

        let w = parseInt(obj.style.getPropertyValue("width"), 10);

        let t = frame.getTransform().slice();
        let textFrame = this.newNativeText({x: t[4] + w + 10, y: t[5], width: 400, height: 300});
        let text = textFrame.querySelector("#text");

        let scriptors = {...this._get("scriptors")};
        scriptors[text.asElementRef().asKey()] = {
            textFrameRef: textFrame.asElementRef(),
            frameRef: frame.asElementRef(),
            objectRef: obj.asElementRef()
        };
        this._set("scriptors", scriptors);
        let codeArray = obj.getCode();
        let code = codeArray[0] || "";
        if (code.length > 0 && !code.trim().startsWith("class")) {
            code = this.getLibrary(code);
        }
        text.load(code || "");
        this.subscribe(text.id, "text", "PasteUpModel.codeAccepted");
    }

    newNativeText(info) {
        let {x, y, width, height} = info;
        let text = this.createElement("TextElement");
        text.domId = "text";

        text.style.setProperty("-cards-direct-manipulation", true);
        text.style.setProperty("-cards-text-margin", "4px 4px 4px 4px");
        text.setDefault("Poppins-Medium", 16);
        text.setWidth(width);

        text.style.setProperty("width", width + "px");
        text.style.setProperty("height", height + "px");
        text.style.setProperty("background-color", "white");

        let t = [1, 0, 0, 1, 0, 0];
        text.setTransform(t);

        let frame = this.createElement();
        frame.setCode("boards.FrameModel");
        frame.setViewCode("boards.FrameView");
        frame.call("FrameModel", "setObject", text, {x, y});

        this.addFrame(frame);
        return frame;
    }

    codeAccepted(data) {
        let {ref, text} = data;
        let info = this._get("scriptors")[ref.asKey()];
        let obj = this.getElement(info.objectRef);
        obj.setCode(text);
    }

    loadDuplicate(data) {
        return this.load(data, "3");
    }

    load(data, version) {
        let SaverClass;
        let myData = data;
        if (version === "3") {
            SaverClass = this.getLibrary("boards.PasteUpSaver3");
            let top = this.wellKnownModel("modelRoot");
            myData = top.parse(data);
        } else {
            SaverClass = this.getLibrary("boards.PasteUpSaver");
            myData = version === "2" ? data : JSON.parse(data);
        }

        let {json /*, sessionFavorites, sessionApps */} = myData;
        let saver = new SaverClass();
        let frames = saver.load(json, this);
        frames.forEach((frame) => {
            this.addFrame(frame);
            let target = this.getElement(frame._get("target"));
            this.comeUpFullyOnReload(frame, target);
        });
        /*
        if (sessionApps) {
            this._set("sessionApps", sessionApps);
            this.publish(this.sessionId, "sessionAppUpdated", null);
        }
        if (sessionFavorites) {
            this._set("sessionFavorites", sessionFavorites);
            this.publish(this.sessionId, "favoritesChanged", null);
        }
        */
        this.publish(this.id, "loadCompleted");
    }

    comeUpFullyOnReload(frame, target) {
        if (target.hasHandler("MiniBrowser")) {
            target.call("MiniBrowser", "comeUpFullyOnReload");
        }
        if (target.hasHandler("Workspace")) {
            this.openWorkspace(null, frame);
        }
    }

    loadPersistentData({ _name, version, data }) {
        try {
            this._delete("loadingPersistentDataErrored");
            this._set("loadingPersistentData", true);
            this.load(data, version);
        } catch (error) {
            console.error("error in loading persistent data", error);
            this._set("loadingPersistentDataErrored", true);
        } finally {
            this._delete("loadingPersistentData");
        }
    }

    savePersistentData() {
        if (this._get("loadingPersistentData")) {return;}
        if (this._get("loadingPersistentDataErrored")) {return;}
        // console.log("persist data");
        this._set("lastPersistTime", this.now());
        let top = this.wellKnownModel("modelRoot");
        let func = () => {
            let SaverClass = this.getLibrary("boards.PasteUpSaver3");
            let name = this._get("sessionName") || "Unknown";
            let saver = new SaverClass();
            let sessionFavorites = this._get("sessionFavorites") || {};
            let sessionApps = this._get("sessionApps") || {};
            let json = saver.save(this);
            return {name, version: "3", data: top.stringify({json, sessionFavorites, sessionApps})};
        };
        top.persistSession(func);
    }

    triggerPersist() {
        let now = this.now();
        let diff = now - this._get("lastPersistTime");
        let period = this._get("persistPeriod");
        // console.log("persist triggered", diff, period);
        if (diff < period) {
            if (!this._get("persistRequested")) {
                // console.log("persist scheduled");
                this._set("persistRequested", true);
                this.future(period - diff).call("PasteUpModel", "triggerPersist");
            }
            // console.log("persist not ready");
            return;
        }
        this._set("lastPersistTime", now);
        this._set("persistRequested", false);
        this.savePersistentData();
    }

    setBackground(data) {
        let {url, type} = data;
        let backdrop = this.parentNode.parentNode.querySelector("#middle-backdrop");
        let pad = this.parentNode;
        if (type === "iframe") {
            let current = this._get("backdrop");
            this._set("backdrop", data);
            if (current) {
                if (current.type === "iframe") {
                    if (backdrop.childNodes.length > 0) {
                        backdrop.childNodes[0].remove();
                    }

                    pad.style.removeProperty("height");
                    this.style.removeProperty("background-color");
                    this.style.removeProperty("background-size");
                }
            }

            if (url.length === 0) {return;}
            let iframe = this.createElement("IFrameElement");
            iframe.domId = "backdrop-iframe";
            iframe.classList.add("backdrop-iframe");

            iframe._set("src", url);
            iframe._set("allow", "camera; microphone; encrypted-media");
            iframe._set("sandbox", "allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-presentation allow-same-origin allow-scripts");
            backdrop.appendChild(iframe);

            pad.style.setProperty("height", "95%");
            this.style.setProperty("background-color", "#00000001");
            this.style.setProperty("background-size", "0 0");
        }
    }
}

//  PasteUpView defines behaviour for the #scaler element, along with RemoteCursorView
class PasteUpView {
    init() {
        this.subscribe(this.sessionId, "fileUpload", "handleFileUpload");
        this.subscribe(this.sessionId, "allUserCursorsUpdated", "allUserCursorsUpdated");
        this.subscribe(this.sessionId, "userCursorUpdated", "userCursorUpdated");
        this.subscribe(this.model.id, "userInfoChanged", "userInfoChanged");
        this.subscribe(this.model.id, "trashObject", "trashObject");

        this.subscribe(this.model.id, "loadCompleted", "loadCompleted");

        this.addEventListener("drop", "drop");

        this.dom.addEventListener("pointermove", (evt) => this.pointerMove(evt), true);
        this.throttleBaseMS = 20;

        this.setup();

        console.log("PasteUpView.init");
    }

    setup() {
        this.setupUserInfo();
        this.iframes = new Map(); // {contentWindow -> iframe}
        this.iframeInitializers = {}; // url -> { message, data }
        this.viewportRestoreSpec = null; // null or { frameId, scalerRect }
        this.docked = [];
        this.userFavorites = [];
        this.userApps = {};
        this.provisionalApp = null; // for use during drag/drop onto tools

        const { Messenger, App } = Croquet;
        Messenger.setReceiver(this);
        Messenger.setIframeEnumerator(() => this.getIframes());
        Messenger.on("appReady", "handleAppReady");
        Messenger.on("sessionInfoRequest", "handleSessionInfoRequest");
        Messenger.on("userInfoRequest", "handleUserInfoRequest");
        Messenger.on("videoChatInitialStateRequest", "handleVideoChatInitialStateRequest");
        Messenger.on("allUserInfoRequest", "handleAllUserInfoRequest");
        Messenger.on("userCursorRequest", "handleUserCursorRequest");
        Messenger.on("transparencyRequest", "handleTransparencyRequest");
        Messenger.on("creatingUserRequest", "handleCreatingUserRequest");
        Messenger.on("appInfo", "handleAppInfo");
        Messenger.on("pointerPosition", "handlePointerPosition");

        Messenger.on("messageSoundRequest", "handleMessageSoundRequest");
        Messenger.on("leaveSoundRequest", "handleLeaveSoundRequest");
        Messenger.on("enterSoundRequest", "handleEnterSoundRequest");

        this.sounds = {};
        for (const asset of ["message", "enter", "leave"]) {
            let path = window._production;
            this.sounds[asset] = new Audio(`${path}/assets/sounds/${asset}.mp3`);
            if (asset === "enter") {
                this.sounds[asset].addEventListener("canplay", () => {
                    let presenter = this.parentNode.model._get("presentingViewId");
                    if (!presenter) {
                        this.sounds[asset].play().catch(console.log);
                    }
                });
            }
        }

        // set up toasts for display if submitted with the property "q_custom"
        App.root = 'middle';
        App.messages = true;
        App.showMessage = (msg, options = {}) => {
            if (!options.q_custom) return;

            App.messageFunction(msg, options);
        };

        // compensate for Safari's idiosyncratic handling
        // of drag-image size and position
        let ua = window.navigator.userAgent;
        let probablySafari = ua.indexOf("Safari") >= 0 && ua.indexOf("Chrome") === -1;
        let size = probablySafari ? 60 : 30;
        let xOff = 24;
        let yOff = probablySafari ? 59 : 29;
        this.model.getLibrary("minibrowser.QRIcon").defaultDragImage(size, size).then(img => {
            this.dragImageDetails = { img, xOff, yOff };
        });

        let url = new URL(window.location.href);
        let launch = url.searchParams.get("launch");
        if (launch) {
            let dataId = url.searchParams.get("dataId");
            this.loadContents(launch, dataId).then((_loaded) => {
                let location = window.location;
                let newLocation = `${location.origin}${location.pathname}?r=${launch}&launched=true`;
                setTimeout(() => window.location.assign(newLocation), 100);
            }).catch((error) => {
                console.log(error);
            });
            return;
        }

        let duplicate = url.searchParams.get("duplicate");
        let newId = url.searchParams.get("newId");
        if (duplicate && newId) {
            this.duplicateAndUpload(newId);
            return;
        }

        // call this only when it is not during the duplication process
        // this has to be called from Q so that the database will know the mapping
        // from viewId to uid.
        let beaconView = window.topView.querySelector("#beacon");
        if (beaconView) {
            beaconView.call("BeaconView", "sendBeacon");
            window.topView.detachCallbacks.push(() => {
                beaconView.call("BeaconView", "clearTimeout");
            });
        }

        this.setupAppFileFormats();

        let participants = window.topView.querySelector("#room-participants");
        if (participants) {
            participants.call("RoomParticipantsView", "setScaler", this);
        }
    }

    setupUserInfo() {
        let viewId = window.topView.viewId;
        let nickname;
        let initials;
        let sessionName;
        if (window.fromLandingPage) {
            nickname = window.fromLandingPage.nickname;
            initials = window.fromLandingPage.initials;
            sessionName = window.fromLandingPage.sessionName;
        }

        if (!nickname) {
            nickname = viewId;
        }

        if (!initials) {
            let pieces = nickname.split(" ").filter(piece => piece.length > 0);
            if (pieces.length === 1) {
                initials = pieces[0].slice(0, 2).toUpperCase();
            } else {
                initials = pieces.map(piece => piece[0]);
                initials = initials[0] + initials.slice(-1);
                initials = initials.toUpperCase();
            }
        }

        let userId = nickname; // @@ until we have the real database id

        console.log("setupUserInfo", nickname, viewId);
        this.localUserInfoPromise = new Promise(resolve => this.localUserInfoResolver = resolve);
        this.publish(this.model.id, "setUserInfo", {nickname, initials, viewId, userId, sessionName});
    }

    getAllUserInfo() {
        return this.model._get("userInfo") || {};
    }

    getUserInfo(viewId) {
        return this.getAllUserInfo()[viewId] || {};
    }

    getUserInitials(viewId) {
        let info = this.getUserInfo(viewId);
        return info.initials;
    }

    getUserId(viewId) {
        let info = this.getUserInfo(viewId);
        return info.userId;
    }

    getUserColor(viewId) {
        let info = this.getUserInfo(viewId);
        return info.userColor;
    }

    getDragImageDetails() {
        return this.dragImageDetails;
    }

    getUserApps() {
        return this.userApps;
    }

    setupAppFileFormats() {
        const specs = this.appFileSpecs = {};
        specs.pix = { types: ["image/jpeg", "image/gif", "image/png", "image/bmp"], extensions: ["jpg", "gif", "png", "bmp"] };
        const url = "https://croquet.io/convert/formats";
        const convertiblesPromise = new Promise(resolve => {
            fetch(url, {
                method: "GET",
                mode: "cors",
                headers: { "Content-Type": "text" }
            }).then(response => {
                return response.ok ? response.json() : null;
            }).then(json => {
                if (json) {
                    // the json is split into values under "document",
                    // "graphics", "presentation", "spreadsheet".
                    // there is overlap between these categories, and
                    // several types that are listed under multiple
                    // file formats.  so gather them with a Set.
                    // similarly for extensions.
                    const types = new Set();
                    const extensions = new Set();
                    Object.values(json).forEach(formats => {
                        formats.forEach(format => {
                            types.add(format.mime);
                            extensions.add(format.extension);
                        });
                    });
                    // feb 2021: EPS conversion doesn't work, for unknown
                    // reasons (need to check the converter deployment)
                    types.delete("application/postscript");
                    extensions.delete("eps");
                    resolve({ types: Array.from(types), extensions: Array.from(extensions) });
                } else {
                    console.warn("failed to load PDF-viewer conversion formats");
                    resolve({ types: [], extensions: [] });
                }
            }).catch((e) => {
                console.error(e.message, e);
                resolve({ types: [], extensions: [] });
            });
        });
        // the convertible types include application/pdf, and are
        // therefore all the types acceptable to docview.
        specs.docviewP = convertiblesPromise;
        // as of Jan 2021, the convertible types also represent all
        // droppable types (even though, on drop, some will be sent
        // to pix)
        specs.allKnownP = convertiblesPromise;
    }

    async getAppForFile(file) {
        const { name, type } = file;
        const specs = this.appFileSpecs;
        if (specs.pix.types.includes(type)) return "pix";

        // we assume any texty file can be converted by docview
        if (type.startsWith('text/')) return "docview";

        // otherwise, check the file's extension against our converter's list
        const extn = name.slice((name.lastIndexOf(".") - 1 >>> 0) + 2); // https://stackoverflow.com/questions/190852/how-can-i-get-file-extensions-with-javascript
        const docviewFormats = await specs.docviewP;
        if (docviewFormats.extensions.includes(extn)) return "docview";

        return null;
    }

    getAllDroppableFileFormats() {
        // called from FileButton.setUpInput.
        // returns a Promise
        return this.appFileSpecs
            ? this.appFileSpecs.allKnownP
            : Promise.resolve({ types: [], extensions: [] });
    }

    setProvisionalApp(appName, spec) {
        if (this.provisionalApp === appName) return; // deal with repeated calls

        if (!this.userApps[appName]) {
            this.userApps[appName] = spec;
            this.provisionalApp = appName;
            this.publish(this.sessionId, "userAppsChanged");
        } else this.provisionalApp = null;
    }

    clearProvisionalApp(keep) {
        if (!this.provisionalApp) return;

        if (!keep) {
            delete this.userApps[this.provisionalApp];
            this.publish(this.sessionId, "userAppsChanged");
        }
        this.provisionalApp = null;
    }

    randomColor(viewId) {
        let h = Math.floor(parseInt(viewId, 36) / (36 ** 10) * 360);
        let s = "40%";
        let l = "40%";
        return `hsl(${h}, ${s}, ${l})`;
    }

    allUserCursorsUpdated() {
        // handle allUserCursorsUpdated event
        let userInfo = this.getAllUserInfo();
        Object.keys(userInfo).forEach(viewId => this.userCursorUpdated(viewId));
    }

    userCursorUpdated(viewId) {
        // handle userCursorUpdated event, or invocation from allUserCursorsUpdated
        this.call("RemoteCursorView", "updatePointer", viewId);

        if (viewId === this.viewId) {
            let cover = window.topView.querySelector("#cover");
            cover.call("CoverView", "setPointer");
        }

    }

    userInfoChanged() {
        let info = this.getAllUserInfo();
        if (info[this.viewId]) this.localUserInfoResolver();
        this.sendAllUserInfo();
    }

    sendAllUserInfo(sourceOrNull) {
        Croquet.Messenger.send("allUserInfo", this.getAllUserInfo(), sourceOrNull);
    }

    pointerMove(evt) {
        // console.log("PasteUpView.pointerMove", evt);
        let x, y;
        let translation = this.currentTranslation || {x: 0, y: 0};
        let zoom = this.currentZoom || 1;
        if (!this.dom.parentNode) {return;}
        let rect = this.dom.parentNode.getBoundingClientRect();
        x = evt.clientX - rect.x;
        y = evt.clientY - rect.y;
        x = (x + translation.x) / zoom;
        y = (y + translation.y) / zoom;

        let target;
        if (typeof evt.target === "string") {
            target = evt.target;
        } else if (typeof evt.target === "object") {
            target = evt.target.key;
        } else {
            target = this.dom.key;
        }

        this.call("RemoteCursorView", "localMouseMove", { time: evt.timeStamp, target, x, y });
    }

    drop(evt) {
        const dropPoint = {x: evt.offsetX, y: evt.offsetY};
        const files = [];
        const dt = evt.dataTransfer;
        if (dt.types.includes("Files")) {
            for (let i = 0; i < dt.files.length; i++) {
                const file = dt.files[i];
                // it would be good to filter out folders at this point,
                // but that's easier said than done.
                // a folder will have type of "", as will any file of a
                // type that the browser doesn't recognise.  if the item
                // has an extension that our apps can handle, the item
                // will be processed (even if its type is empty).
                // a folder that appears to have an extension will be
                // processed, but will fail at the reading stage.
                files.push(file);
            }
        }
        if (files.length) this.handleFileUpload(files, dropPoint);
    }

    addAsset(descriptor) {
        this.publish(this.model.id, "addAsset", {
            descriptor,
            currentTranslation: this.currentTranslation,
            currentZoom: this.currentZoom,
            dropPoint: descriptor.dropPoint
        });
    }

    openDialog(pos, label, type, callback, initialValue) {
        // since removal of intermediate file-upload dialog, for now this
        // is expected to be invoked only with type="text".  old code
        // structure is retained in case we come up with other dialog needs.
        let removeDialog = () => {
            if (this.dialog) {
                this.dialog.remove();
                this.dialog = null;
            }
        };

        if (this.dialog) {
            removeDialog();
            return;
        }

        this.dialog = document.createElement("div");
        this.dialog.classList.add("simpleDialog");

        if (type === "text") {
            this.dialog.innerHTML = `<span style="font-family: Poppins-Medium">${label}:</span><br><input id="field" type="text" autocomplete="off" style="width:200px; height: 20px"></input><br><button id="accept">Accept</button>&nbsp;<button id="cancel">Cancel</button>`;
        }

        let field = this.dialog.querySelector("#field");

        let cancelCallback = _evt => {
            callback(null);
            removeDialog();
        };
        let acceptCallback;
        let evtCallback;
        if (type === "text") {
            acceptCallback = (_evt) => {
                let value = field.value;
                callback(value);
                removeDialog();
            };
            evtCallback = (evt) => {
                if (evt.key === "Enter" || evt.keyCode === 13 || evt.keyCode === 10) {
                    acceptCallback(evt);
                }
                if (evt.key === "Escape") cancelCallback();
            };

            field.addEventListener("keydown", evtCallback);
        }

        this.dialog.style.setProperty("left", (pos.x + 32) + "px");
        this.dialog.style.setProperty("top", (pos.y + 32) + "px");

        if (type === "text") {
            this.dialog.querySelector("#cancel").addEventListener("click", cancelCallback);
            this.dialog.querySelector("#accept").addEventListener("click", acceptCallback);
        }

        let parent = document.body;
        parent.appendChild(this.dialog);

        if (type === "text") {
            field.focus();
            if (initialValue) field.value = initialValue;
        }
    }

    async handleFileUpload(files, dropPoint = null) {
        const MAX_FILE_MB = 50;
        let currentTranslation = this.currentTranslation;
        let zoom = this.currentZoom;

        const uploads = { pix: [], docview: [] };
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const { size, type } = file;

            if (size > MAX_FILE_MB * 1048576) {
                this.showToastWarning(`${file.name} exceeds max size of ${MAX_FILE_MB}MB`);
                continue;
            }

            // because we're waiting on a single promise, there's
            // no merit in parallelising the lookups.
            // eslint-disable-next-line no-await-in-loop
            let app = await this.getAppForFile(file); // currently assumed to be "pix", "docview", or null
            if (app) uploads[app].push(file);
            else {
                this.showToastWarning(`${file.name} is of unhandled type "${type}"`);
                continue;
            }
        }

        let stagger = { x: 0, y: 0 };
        let makeDisplayPoint = () => {
            let pt;
            if (dropPoint) {
                pt = {x: dropPoint.x + stagger.x, y: dropPoint.y + stagger.y};
                stagger.x += 60;
                stagger.y += 40;
            } else {
                pt = {
                    x: (currentTranslation.x + (Math.random() * 50 - 25) + 200) / zoom,
                    y: (currentTranslation.y + (Math.random() * 50 - 25) + 100) / zoom
                };
            }
            return pt;
        };

        let getSendableSpec = file => {
            let bufP;
            // File.arrayBuffer is sparsely supported
            if (file.arrayBuffer) bufP = file.arrayBuffer(); // Promise
            else {
                bufP = new Promise(resolve => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.readAsArrayBuffer(file);
                });
            }

            return bufP.then(buf => {
                if (buf.byteLength) {
                    return {
                        name: file.name,
                        size: file.size,
                        type: file.type,
                        croquet_contents: buf
                    };
                }
                throw Error("length is zero");
            }).catch(err => {
                this.showToastWarning(`${file.name} - ${err.message}`);
                return null;
            });
        };

        let appDefs = this.model._get("sessionApps");
        let pad = window.topView.querySelector("#pad");
        let makeUrl = app => pad.call("TransformView", "urlFromTemplate", appDefs[app].urlTemplate);

        // // all pix files go into one iframe
        // if (uploads.pix.length) {
        //     let fileSpecs = (await Promise.all(uploads.pix.map(file => getSendableSpec(file)))).filter(Boolean);
        //     if (fileSpecs.length) {
        //         let displayPoint = makeDisplayPoint();
        //         let url = makeUrl("pix");
        //         let iframeArgs = {
        //             x: displayPoint.x,
        //             y: displayPoint.y,
        //             width: 600,
        //             height: 500,
        //             viewId: this.viewId,
        //             type: "pix",
        //             url,
        //             appInfo: appDefs["pix"]
        //         };
        //         this.iframeInitializers[url] = { message: "uploadFiles", data: { files: fileSpecs } };
        //         this.publish(pad.model.id, "newIFrame", iframeArgs);
        //     }
        // }

        // pix files becomes a native image
        if (uploads.pix.length) {
            let load = async (item) => {
                const data = await new Promise(resolve => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.readAsArrayBuffer(item);
                });

                const handle = await Croquet.Data.store(this.sessionId, data);

                let displayPoint = makeDisplayPoint();
                let iframeArgs = {
                    displayPoint,
                    width: 600,
                    height: 500,
                    viewId: this.viewId,
                    handle,
                    type: "image",
                };
                this.publish(pad.model.id, "newImage", iframeArgs);
            };

            uploads.pix.forEach(load);
        }

        // each docview gets its own
        if (uploads.docview.length) {
            uploads.docview.forEach(async file => {
                let fileSpec = await getSendableSpec(file);
                if (fileSpec) {
                    let displayPoint = makeDisplayPoint();
                    let url = makeUrl("docview");
                    let iframeArgs = {
                        x: displayPoint.x, y: displayPoint.y,
                        width: 600, height: 500,
                        viewId: this.viewId,
                        type: "docview",
                        url,
                        appInfo: appDefs["docview"]
                    };
                    this.iframeInitializers[url] = { message: "uploadFile", data: { file: fileSpec } };
                    this.publish(pad.model.id, "newIFrame", iframeArgs);
                }
            });
        }
    }

    getIframes() {
        let result = [];
        let add = (e, check) => {
            let iframe = e.querySelector("iframe");
            if (iframe) {
                if (check) {
                    if (result.indexOf(iframe) >= 0) {return;}
                }
                result.push(iframe);
            }
        };
        this.dom.childNodes.forEach(add);
        this.docked.forEach(add);
        return result;
    }

    ensureIframeEntry(source) {
        let iframe = this.iframes.get(source);
        if (!iframe) {
            let iframes = this.getIframes();
            iframe = iframes.find(i => i.contentWindow === source);
            if (!iframe) {return null;}
            this.iframes.set(source, iframe);
        }
        return iframe;
    }

    computeSessionHandles() {
        // derive handles { persistent, ephemeral } from the
        // persistentId and sessionId respectively.
        if (!this.sessionHandlesP) {
            this.sessionHandlesP = new Promise((resolve, reject) => {
                let subtle = window.crypto.subtle;
                if (!subtle) {
                    reject(new Error("crypto.subtle is not available"));
                    return;
                }
                let encoder = new TextEncoder();
                let persistent = this.session.persistentId;
                let ephemeral = this.sessionId;
                let promises = [persistent, ephemeral].map(id => {
                    return subtle.digest("SHA-256", encoder.encode(id)).then((bits) => {
                        let map = Array.prototype.map;
                        let handle = map.call(
                            new Uint8Array(bits),
                            x => ("00" + x.toString(16)).slice(-2)).join("");
                        return handle;
                    });
                });
                Promise.all(promises).then(([pHandle, eHandle]) => resolve({persistent: pHandle, ephemeral: eHandle}));
            });
        }

        return this.sessionHandlesP;
    }

    handleAppReady(url, source) {
        this.ensureIframeEntry(source);
        Croquet.Messenger.send("appInfoRequest", null, source);
        if (url && this.iframeInitializers[url]) {
            let { message, data } = this.iframeInitializers[url];
            Croquet.Messenger.send(message, data, source);
            delete this.iframeInitializers[url];
        }
    }

    handleSessionInfoRequest(data, source) {
        let handles = this.computeSessionHandles(); // { persistent, ephemeral }
        let sessionName = window.fromLandingPage && window.fromLandingPage.boardName;
        if (!sessionName) sessionName = this.getSessionName();  // for old ?q=name sessions
        // feb 2021: now supplying an additional handle based on the
        // current session (because some apps - notably video chat - need
        // to know when the hosting session has been updated to new code).
        // for backwards compatibility this is passed as ephemeralSessionHandle,
        // while sessionHandle still represents the persistent session.
        Promise.all([handles, sessionName]).then(([h, s]) => {
            Croquet.Messenger.send("sessionInfo", {sessionHandle: h.persistent, sessionName: s, ephemeralSessionHandle: h.ephemeral}, source);
        });
    }

    async handleUserInfoRequest(data, source) {
        this.ensureIframeEntry(source);
        await this.localUserInfoPromise;
        let origUserInfo = this.getUserInfo(this.viewId);
        let userInfo = {...origUserInfo, viewId: this.viewId};
        Croquet.Messenger.send("userInfo", userInfo, source);
    }

    handleAllUserInfoRequest(data, source) {
        this.sendAllUserInfo(source);
    }

    handleVideoChatInitialStateRequest(data, source) {
        let fromLandingPage = window.fromLandingPage || {};
        let info = {
            mic: fromLandingPage.mic || "on",
            video: fromLandingPage.video || "on",
            cameraDeviceId: fromLandingPage.cameraDeviceId,
            cameraDeviceLabel: fromLandingPage.cameraDeviceLabel,
            cameraDeviceIndex: fromLandingPage.cameraDeviceIndex,
            micDeviceId: fromLandingPage.micDeviceId,
            micDeviceLabel: fromLandingPage.micDeviceLabel,
            micDeviceIndex: fromLandingPage.micDeviceIndex,
            fromLandingPage: !!window.fromLandingPage,
        };
        Croquet.Messenger.send("videoChatInitialState", info, source);
    }

    handleUserCursorRequest(data, source) {
        this.ensureIframeEntry(source);
        let cursor = this.dom.style.getPropertyValue("cursor");
        Croquet.Messenger.send("userCursor", cursor, source);
    }

    miniBrowserViewForSource(source) {
        let iframe = this.ensureIframeEntry(source);
        let parent = iframe && iframe.parentNode;
        let key = parent && parent.key;
        let view = key && window.views[key];
        if (view && view.hasHandler("MiniBrowserView")) return view;
        return null;
    }

    handleTransparencyRequest(data, source) {
        let view = this.miniBrowserViewForSource(source);
        if (view) view.call("MiniBrowserView", "updateTransparency");
    }

    handleCreatingUserRequest(data, source) {
        let view = this.miniBrowserViewForSource(source);
        if (view) view.call("MiniBrowserView", "sendCreatingUser");
    }

    handleAppInfo(data, source) {
        let view = this.miniBrowserViewForSource(source);
        //console.log("handleAppInfo", data);
        if (view) view.call("MiniBrowserView", "setAppInfo", data);
    }

    handlePointerPosition(position, source) {
        let iframe = this.ensureIframeEntry(source);
        if (!iframe) {return;}
        let zoom = this.currentZoom || 1;
        let rect = iframe.getBoundingClientRect();

        // we multiply zoom here but later divide by zoom in pointerMove,
        // but this is simple enough
        let x = rect.x + (position.x * zoom);
        let y = rect.y + (position.y * zoom);

        let data = {clientX: x, clientY: y, target: this.dom.key, timeStamp: Date.now()};
        // its fields have to match up with the ones that are used in pointerMove()

        this.pointerMove(data);
    }

    trashObject(target) {
        let key = target.asElementRef().asKey();
        let view = window.views[key];
        if (!view) {return;}
        let iframe = view.dom.querySelector("iframe");
        if (iframe) {
            this.iframes.delete(iframe.contentWindow, iframe);
        }
        // let menuView = view.querySelector("#dots");
        // menuView.call("FrameMenuView", "hideRemoteMenu");
    }

    addToDock(parent) {
        if (this.docked.indexOf(parent) < 0) {
            this.docked.push(parent);
        }
    }

    removeFromDock(parent) {
        let index = this.docked.indexOf(parent);
        if (index >= 0) {
            this.docked.splice(index, 1);
        }
    }

    nameAndSetFavorite(pos, faveType, spec) {
        let callback = faveName => {
            this.clearProvisionalApp(!!faveName); // keep iff a name has been supplied
            if (!faveName) return;

            faveName = faveName.trim();

            if (faveType === "session") {
                spec.sessionFave = true;
                spec.proposedSessionName = faveName;
            } else if (faveType === "user") {
                spec.userFave = true;
                spec.proposedUserName = faveName;
            }
            this.setFavorite(spec);
        };
        let existingSessionFave = this.model._get("sessionFavorites")[spec.url];
        let sessionName = existingSessionFave && existingSessionFave.faveName;
        let existingUserFave = this.userFavorites[spec.url];
        let userName = existingUserFave && existingUserFave.faveName;
        let proposedName = faveType === "session"
            ? sessionName || userName    // ...existing session name gets precedence
            : userName || sessionName;   // ...opposite
        proposedName = proposedName || "";
        this.openDialog(pos, `Name for ${faveType} favorite`, "text", callback, proposedName);
    }

    getAppFavorites(appName) {
        // return an array of objects { url, userName, sessionName }.

        // first get the session favourites held by the model
        let sessionFavesDict = this.model._get("sessionFavorites");
        let faves = [];
        for (let [url, spec] of Object.entries(sessionFavesDict)) {
            if (spec.appInfo.appName === appName) faves.push({ url, sessionName: spec.faveName });
        }
        // then annotate each one that is also a user favorite
        let userFavesCopy = {...this.userFavorites}; // specs keyed by url
        if (Object.keys(userFavesCopy).length) {
            faves.forEach(spec => {
                let { url } = spec;
                let uSpec = userFavesCopy[url];
                if (uSpec) {
                    spec.userName = uSpec.faveName;
                    delete userFavesCopy[url];
                }
            });
            // and add user faves that aren't also session faves
            Object.keys(userFavesCopy).forEach(url => {
                let uSpec = userFavesCopy[url];
                let { appInfo: { appName: uApp }, faveName } = uSpec;
                if (uApp === appName) {
                    faves.push({url, userName: faveName});
                }
            });
        }
        return faves;
    }

    setFavorite(spec) {
        // invoked when user asks to create a new favourite
        // (session- or user-level), or edits a favourite's name, or
        // toggles sessionFave or userFave status.
        // spec properties:
        //   url: the url in question
        //   appInfo: all details needed to create a tool button (appName, label, iconName, urlTemplate)
        //   userFave: if true/false, add or remove user favorite
        //   proposedUserName: needed if userFave is true
        //   sessionFave: if true/false, add or remove session favorite
        //   proposedSessionName: needed if sessionFave is true

        // console.log("setFavorite", spec);
        let { appInfo, url, sessionFave, userFave } = spec;
        if (userFave !== undefined) {
            if (!this.walletIframe) {
                console.warn("favorite set before wallet iframe known");
                return;
            }
            let walletUpdate = { favorites: { url, spec: userFave ? { appInfo, faveName: spec.proposedUserName } : null } };
            Croquet.Messenger.send("updateWalletContents", walletUpdate, this.walletIframe.contentWindow);
        }
        if (sessionFave !== undefined) {
            let faveUpdate = { appInfo, url, status: sessionFave };
            if (sessionFave) faveUpdate.proposedName = spec.proposedSessionName;
            this.publish(this.model.id, "setSessionFavorite", faveUpdate);
        }
    }

    save(name, asTemplate) {
        let SaverClass = this.model.getLibrary("boards.PasteUpSaver3");
        let saver = new SaverClass();
        let sessionFavorites = this.model._get("sessionFavorites") || {};
        let sessionApps = this.model._get("sessionApps") || {};
        let json = saver.save(this.model, null, asTemplate);
        let top = this.wellKnownModel("modelRoot");

        return this.uploadContents({name, version: "3", data: top.stringify({json, sessionFavorites, sessionApps})});
    }

    getSessionName() {
        let name = this.model._get("sessionName");
        return name ? Promise.resolve(name) : Croquet.App.autoSession("q");
    }

    saveRequest(pos, askName) {
        this.getSessionName().then((proposedName) => {
            if (!askName) {
                this.save(proposedName);
                return;
            }

            let callback = (sessionName) => {
                if (!sessionName) return;
                sessionName = sessionName.trim();
                this.save(sessionName);
            };
            this.openDialog(pos, `New Session Name: `, "text", callback, proposedName);
        });
    }

    loadRequest(pos, askName) {
        this.getSessionName().then((name) => {
            if (!askName) {
                this.loadContents(name);
                return;
            }

            let callback = (loadName) => {
                if (!loadName) return;
                loadName = loadName.trim();
                this.loadContents(loadName);
            };
            this.openDialog(pos, `Load Session Named: `, "text", callback, name);
        });
    }

    uploadContents(data) {
        return Croquet.Data.store(this.sessionId, data.data).then((handle) => {
            return {action: "duplicate", name: data.name, id: Croquet.Data.toId(handle)};
        });
    }

    duplicateAndUpload(newId) {
        return this.save(newId, true).then((dataInfo) => {
            let {action, name, id} = dataInfo;
            console.log(action, name, id);
            let location = window.location;
            let newLocation = `${location.origin}${location.pathname}?r=${newId}&launch=${newId}&dataId=${encodeURIComponent(id)}`;
            window.location.assign(newLocation);
        });
    }

    loadContents(newId, dataId) {
        let handle = Croquet.Data.fromId(dataId);
        return Croquet.Data.fetch(this.sessionId, handle).then((data) => {
            let decoder = new TextDecoder();
            let json = decoder.decode(data);
            this.publish(this.model.id, "loadContents", json);
        });
    }

    loadCompleted() {
        if (this.loadResolve) {
            let resolve = this.loadResolve;
            delete this.loadPromise;
            delete this.loadResolve;
            delete this.loadReject;
            resolve(true);
        }
    }

    handleMessageSoundRequest() {
        let presenter = this.parentNode.model._get("presentingViewId");
        if (!presenter) {
            this.sounds.message.play().catch(console.log);
        }
    }

    handleEnterSoundRequest() {
        let presenter = this.parentNode.model._get("presentingViewId");
        if (!presenter) {
            this.sounds.enter.play().catch(console.log);
        }
    }

    handleLeaveSoundRequest() {
        let presenter = this.parentNode.model._get("presentingViewId");
        if (!presenter) {
            this.sounds.leave.play().catch(console.log);
        }
    }

    showToast(msg, level, duration) { Croquet.App.showMessage(msg, { q_custom: true, position: 'center', level, duration }); }
    showToastLog(msg) { this.showToast(msg); }
    showToastWarning(msg) { this.showToast(msg, "warning", 3000); }
    showToastError(msg) { this.showToast(msg, "error", 3000); }
}


// RemoteCursorView defines behaviour for the #scaler element, along with PasteUpView
class RemoteCursorView {
    init() {
        if (this.pointers) {
            for (let k in this.pointers) {
                this.deletePointer(k);
            }
        }

        if (!this.assetLib) {
            let Cls = this.model.getLibrary("boards.AssetLibrary");
            this.assetLib = new Cls();
        }

        this.pointers = {};
        this.lastPointer = { time: 0, target: null, x: 0, y: 0, viewId: this.viewId };
        // plug this object/trait into the topView as the means of handling
        // pointer changes.  only provide the functions that are allowed to
        // be called from other objects.
        window.topView.pointerTracker = {
            target: this,
            trait: "RemoteCursorView",
            pointerMoved: "pointerMoved",
            deletePointer: "deletePointer",
            deleteAllPointers: "deleteAllPointers",

            // probably not needed
            // setPointer: "setPointer",
            // publishPointer: "publishPointer"
        };

        this.setPointer();
        console.log("RemoteCursorView.init");
    }

    setPointer() {
        // set the image to be used by the hardware cursor when over this element
        let pointer = this.ensurePointer(this.viewId);
        this.dom.style.setProperty("cursor", `${pointer.style.getPropertyValue("background-image")},auto`);
        pointer.remove();
    }

    localMouseMove(info) {
        let {target, time, x, y} = info;

        if (this.lastPointer.x !== x || this.lastPointer.y !== y) {
            this.lastPointer.target = target;
            this.lastPointer.x = x | 0;
            this.lastPointer.y = y | 0;
            this.lastPointer.time = time | 0;

            window.topView.throttledInvoke("publishPointer", this.throttleBaseMS, () => this.publishPointer({ target: this.lastPointer.target, x: this.lastPointer.x, y: this.lastPointer.y, time: this.lastPointer.time, viewId: this.viewId }));
        }
    }

    deleteAllPointers() {
        for (let k in this.pointers) {
            this.pointers[k].remove();
            delete this.pointers[k];
        }
    }

    deletePointer(viewId) {
        let pointer = this.pointers[viewId];
        if (pointer) {
            pointer.remove();
            delete this.pointers[viewId];
        }
    }

    pointerMoved(obj) {
        // place the cursor for the specified view.
        // we assume no rotation.
        let {target, x, y, viewId} = obj;
        if (viewId === this.viewId) {return;}
        if (!target) {return;}

        let pointer = this.ensurePointer(viewId);

        // the view that a pointer was last recorded as having been
        // over might no longer exist.
        let view = window.views[target];
        if (view && view.model._get("_parent")) {
            view = view.parentNode;
            x -= view.dom.scrollLeft;
            y -= view.dom.scrollTop;
            // should be used only for canvas, where you cannot append another element
        }

        let zoom = this.currentZoom;
        let currentTranslation = this.currentTranslation;
        if (!zoom || !currentTranslation) {return;}
        let tmpX = (x * zoom) - currentTranslation.x;
        let tmpY = (y * zoom) - currentTranslation.y;

        pointer.style.setProperty("transform", `translate(${tmpX}px,${tmpY}px)`);
    }

    ensurePointer(viewId) {
        let name = this.call("PasteUpView", "getUserInitials", viewId);
        if (!this.pointers[viewId]) {
            let pointer = document.createElement('div');
            pointer.setAttribute("cursor-name", name); // ael - not used?
            pointer.style.setProperty("position", "absolute");
            pointer.style.setProperty("background-repeat", "no-repeat");
            pointer.style.setProperty("background-size", "contain");
            pointer.style.setProperty("width", "32px");
            pointer.style.setProperty("height", "32px");
            pointer.style.setProperty('user-select', 'none');
            pointer.style.setProperty('pointer-events', 'none');
            pointer.style.setProperty("left", "0px");
            pointer.style.setProperty("top", "0px");
            this.pointers[viewId] = pointer;
            this.updatePointerShape(viewId);
            window.topView.dom.appendChild(pointer);
        }
        return this.pointers[viewId];
    }

    updatePointer(viewId) {
        // invoked only from pasteUpView.userCursorUpdated (a behaviour on this
        // same object), which handles the arrival of the name details for a
        // client, or a change in the client's status (e.g., due to start of
        // a presentation).
        // it assumes that the styled pointer div (created by ensurePointer)
        // already exists.
        let pointer = this.pointers[viewId];
        if (!pointer) return;

        this.updatePointerShape(viewId);

        if (viewId === this.viewId) {
            this.dom.style.setProperty("cursor", `${pointer.style.getPropertyValue("background-image")},auto`);
        }
    }

    updatePointerShape(viewId) {
        let pointer = this.pointers[viewId];

        let size = Object.keys(this.pointers).length;

        let viewDetails = window.topView.pluggableDispatch("viewportTracker", "getViewDetails", viewId);
        if (!viewDetails) return; // during initialisation

        let { isLocal, isPresenter, isFollower, isActive } = viewDetails;
        let userInfo = this.call("PasteUpView", "getUserInfo", viewId);
        let userColor = userInfo ? userInfo.userColor : "darkblue";
        let outlineColor = userColor;
        // dec 2020: don't change cursors for presentation
        let fillColor = isLocal ? userColor : (isPresenter ? "white" : "white");
        let initials = this.call("PasteUpView", "getUserInitials", viewId);
        let initialsColor = isLocal
            ? (isPresenter ? "white" : "white")
            : (isPresenter ? userColor : userColor);
        let opacity;
        if (isLocal || isPresenter || (isActive && !isFollower)) {
            opacity = "1";
        } else {
            opacity = (size < 10) ? "0.3" : "0.1";
        }

        // console.log({ viewId, initials, isLocal, isPresenter, isFollower, isActive });

        let svg = this.assetLib.avatar(initials, outlineColor, fillColor, initialsColor);
        svg = encodeURIComponent(svg);
        svg = `url('data:image/svg+xml;utf8,${svg}')`;
        pointer.style.setProperty("background-image", svg);

        pointer.style.setProperty("opacity", opacity);
    }

    publishPointer(info) {
        this.publish(this.model.sessionId, "viewPointerMoved", info);
    }
}

class AppButtonManager {
    init() {
        this.subscribe(this.sessionId, "updatedToolState", "updatedToolState");
        this.subscribe(this.sessionId, "dropHighlightedTool", "dropHighlightedTool");
        this.subscribe(this.sessionId, "toolFavoritesChanged", "toolFavoritesChanged"); // published by TransformModel
        this.subscribe(this.sessionId, "appsChanged", "refreshAppButtons");

        // this.svgStar = new (this.model.getLibrary("boards.SVGLib"));

        this.appButtons = {}; // appName to button elementview
        this.initAppButtonClass();
        this.initUtilityButtonClasses();
        this.refreshAppButtons();
        this.refreshUtilButtons();

        console.log("AppButtonManager.init");
    }

    refreshAppButtons() {
        // the appButtons collection is a merge of sessionApps
        // from the PasteUpModel and userApps from the PasteUpView.
        // if an app is only in the userApps collection, give its
        // button a "userOnly" property so it can be highlighted
        // in the interface.
        let appButtons = this.appButtons; // appName to button view
        let appRegion = window.topView.querySelector("#toolsAppRegion");
        let scaler = window.topView.querySelector("#scaler");

        // gather all apps known to session and user
        let sessionApps = scaler.model._get("sessionApps");
        let userApps = scaler.call("PasteUpView", "getUserApps");
        let allApps = {};
        for (let [appName, spec] of Object.entries(sessionApps)) allApps[appName] = spec;
        for (let [appName, spec] of Object.entries(userApps)) allApps[appName] = spec;

        // remove buttons that are no longer mentioned
        for (let [appName, button] of Object.entries(appButtons)) {
            if (!allApps[appName]) {
                delete appButtons[appName];
                button.dom.remove();
            }
        }

        // create new buttons as needed, and adjust all buttons' userOnly state

        let sorted = Object.keys(allApps);
        sorted.sort((a, b) => {
            let ia = allApps[a];
            let ib = allApps[b];
            return ia.order - ib.order;
        });

        let createButton = (spec) => {
            let {appName, label, iconName, urlTemplate, noURLEdit, noSandbox, viewBox} = spec;
            let button = this.makeAppButton({ appName, label, iconName, urlTemplate, noURLEdit, noSandbox, viewBox });
            return [appName, button];
        };

        sorted.forEach((appName) => {
            let spec = allApps[appName];
            if (!appButtons[appName]) {
                let { label, iconName, urlTemplate, noURLEdit, noSandbox, pressHold, viewBox } = spec;
                let button = this.makeAppButton({ appName, label, iconName, urlTemplate, noURLEdit, noSandbox, pressHold, viewBox });

                if (pressHold) {
                    let [secondaryAppName, secondaryButton] = createButton(pressHold);
                    button.setSecondaryButton(secondaryAppName, secondaryButton);
                    appButtons[secondaryAppName] = secondaryButton;
                }

                appRegion.dom.appendChild(button.containerDom || button.dom);
                appButtons[appName] = button;
            }
            let userOnly = !sessionApps[appName];
            let button = appButtons[appName];
            if (userOnly) button.dom.setAttribute("userOnly", "true");
            else button.dom.removeAttribute("userOnly");
        });
    }

    refreshUtilButtons() {
        let utilRegion = window.topView.querySelector("#toolsUtilRegion");
        let scaler = window.topView.querySelector("#scaler");
        let utilitySpecs = scaler.model._get("sessionUtilities");

        let sorted = Object.keys(utilitySpecs);
        sorted.sort((a, b) => {
            let ia = utilitySpecs[a];
            let ib = utilitySpecs[b];
            return ia.order - ib.order;
        });

        sorted.forEach(utilityName => {
            let spec = utilitySpecs[utilityName];
            if (spec.label === "-") {
                let divider = document.createElement("div");
                divider.classList.add("toolsDivider");
                // divider.style.order = spec.order;
                utilRegion.dom.appendChild(divider);
            } else {
                let button = this.makeUtilityButton({ utilityName, ...spec });
                button.dom.style.setProperty("order", spec.order);
                utilRegion.dom.appendChild(button.dom);
            }
        });
    }

    setIconAndLabel(domElement, iconName, label, viewBox, hoverInverted = false) {
        let result = [];

        let name = "img-" + iconName.slice(0, iconName.length - ".svgIcon".length);
        let unhoverName = hoverInverted ? `${name}-inverted` : name;
        let hoverName = hoverInverted ? name : `${name}-inverted`;
        let vb = viewBox ? `0 0 ${viewBox[0]} ${viewBox[1]}` : "0 0 24 24";
        let html = `<div id="button-icon" class="no-select tool-button-holder">
        <svg viewBox="${vb}" class="tool-button-icon unhovered">
        <use href="#${unhoverName}"></use></svg>
        <svg viewBox="${vb}" class="tool-button-icon hovered">
        <use href="#${hoverName}"></use></svg></div>`;
        result.push(html);

        if (label) result.push(`<span class="no-select tool-button-label">${label}</span>`);

        domElement.innerHTML = result.join("");
    }

    initAppButtonClass() {
        this.AppButtonClass = this.model.getLibrary("boards.AppButton");
    }

    initUtilityButtonClasses() {
        this.UtilityButtonClass = this.model.getLibrary("boards.UtilityButton");
        this.PresentationButtonClass = this.model.getLibrary("boards.PresentationButton");
        this.FileButtonClass = this.model.getLibrary("boards.FileButton");
    }

    makeAppButton(spec) {
        return new (this.AppButtonClass)(this, spec);
    }

    makeUtilityButton(spec) { // spec is { utilityName, label, iconName, buttonClass }
        let ButtonClass = this[spec.buttonClass];
        return new ButtonClass(this, spec);
    }

    doWithAppButtons(fn) { Object.values(this.appButtons).forEach(fn); }
    updatedToolState(data) { this.doWithAppButtons(b => b.updatedToolState(data)); }
    dropHighlightedTool(data) { this.doWithAppButtons(b => b.dropHighlightedTool(data)); }
    toolFavoritesChanged(data) { this.doWithAppButtons(b => b.toolFavoritesChanged(data)); }
}

class VideoChatView {
    init() {
        if (!window.fromLandingPage) {return;}
        let chat = window.fromLandingPage.chat;
        if (chat && (chat !== "videoOnly" || chat === "off")) {return;}
        let iframe = this.dom.querySelector("#videoChatFrame");
        if (!iframe) {
            iframe = document.createElement("iframe");
            iframe.allow = "camera; microphone";
            iframe.id = "videoChatFrame";
            iframe.classList.add("docked-iframe");
            this.dom.appendChild(iframe);
        }

        // @@@@@@@@@ development support
        let localVideo = /localVideo/.exec(window.location.href);
        if (localVideo) {
            let chatUrl = "tmpVideoChat/index.html";
            if (/toxiproxy/.exec(window.location.href)) chatUrl += '?toxiproxy=true';
            iframe.src = chatUrl;
        } else {
            iframe.src = this.url("../video-chat");
        }
        console.log("video app location: " + iframe.src);

        window.topView.requestInitialization(this, "VideoChatView", "setup");
    }

    setup() {
        if (!window.fromLandingPage) {return;}
        let chat = window.fromLandingPage.chat;

        this.scaler = window.topView.querySelector("#scaler");

        this.dom.style.setProperty("width", "100%");

        if (chat === "videoOnly") {
            this.dom.style.setProperty("height", "100%");
        } else {
            this.dom.style.setProperty("height", "60%");
        }

        this.scaler.call("PasteUpView", "addToDock", this.dom);
    }

    url(url) {
        if (url.startsWith("http")) {return url;}

        // running on http://localhost:8000
        //  "./apps/text.html" => localhost:8000/apps/text.html
        //  "https://example.com/foo" => https://example.com/foo
        //  "../video-chat" => https://croquet.io/dev/q/../video-chat => https://croquet.io/dev/video-chat

        //  running on somewhere else, including https://croquet.io/test
        //  "./apps/text.html" => https://croquet.io/test/apps/text.html
        //  "https://example.com/foo" => https://example.com/foo
        //  "../video-chat" => https://croquet.io/dev/../video-chat => https://croquet.io/video-chat

        let path = window.location.origin + window.location.pathname;
        let hostname = window.location.hostname;

        if (hostname === "localhost" || hostname.endsWith(".ngrok.io")) {
            // many bets are off
            if (!url.startsWith("http") || !url.startsWith(".")) {
                return new URL(url, "https://croquet.io/dev/q/").toString();
            }
        }

        // until we changes the situation here
        if (path.indexOf("files/v1/pitch") >= 0) {
            return new URL(url, "https://croquet.io/dev/q/").toString();
        }

        if (url.startsWith(".")) {return new URL(url, path).toString();}
        throw new Error("unrecognized URL fragment");
    }
}

class TextChatView {
    init() {
        // we need to check that this makes the initialization of the text chat later than the initialization of Q
        window.topView.requestInitialization(this, "TextChatView", "setup");
    }

    setup() {
        if (!window.fromLandingPage) { return; }
        let chat = window.fromLandingPage.chat;
        if (chat && (chat !== "textOnly" || chat === "off")) { return; }
        let iframe = this.dom.querySelector("#textChatFrame");
        if (!iframe) {
            iframe = document.createElement("iframe");
            iframe.id = "textChatFrame";
            iframe.classList.add("docked-iframe");
            this.dom.appendChild(iframe);
        }

        this.scaler = window.topView.querySelector("#scaler");

        this.scaler.call("PasteUpView", "computeSessionHandles").then((handles) => {
            let isLocal = window.topView.isRunningLocally() || !window.fromLandingPage ? "&isLocal" : "";

            let path = window._production;
            iframe.src = this.url(`${path}/text-chat.html?q=${handles.persistent}&docked=true${isLocal}`);
            console.log("text-chat app location: " + iframe.src);

        });

        this.dom.style.setProperty("flex-grow", "1");
        this.dom.style.setProperty("width", "100%");
        this.dom.style.setProperty("height", "40%");

        this.scaler.call("PasteUpView", "addToDock", this.dom);
    }

    url(url) {
        if (url.startsWith("http")) { return url; }
        let path = window.location.origin + window.location.pathname;
        if (url.startsWith(".")) { return new URL(url, path).toString(); }
        throw new Error("unrecognized URL fragment");
    }
}

class ToolsView {
    init() {
        let appRegionDom = this.querySelector("#toolsAppRegion").dom;
        appRegionDom.addEventListener("dragenter", evt => this.dragEnter(evt), true);
        appRegionDom.addEventListener("dragover", evt => this.dragOver(evt), true);
        appRegionDom.addEventListener("dragleave", evt => this.dragLeave(evt), true);
        appRegionDom.addEventListener("drop", evt => this.drop(evt), true);
        this.dragEnterSeen = this.dragEnterHandled = false;

        this.circle(0.1);
        let top = window.topView.querySelector("#top");
        top.dom.appendChild(this.circleCanvas);
        console.log("ToolsView.init");
    }

    circle(rad, x, y) {
        if (!this.circleCanvas) {
            this.circleCanvas = document.createElement("canvas");
            this.circleCanvas.width = 32;
            this.circleCanvas.height = 32;
            this.circleCanvas.classList.add("circleCanvas");
        }

        if (rad === 0) {
            this.circleCanvas.style.setProperty("display", "none");
            return;
        }

        let ctx = this.circleCanvas.getContext("2d");
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#4CF048";
        ctx.clearRect(0, 0, 32, 32);
        ctx.beginPath();
        let hPi = 0.5 * Math.PI;
        ctx.arc(16, 16, 14, -hPi, rad - hPi);
        ctx.stroke();

        this.circleCanvas.style.removeProperty("display");
        this.circleCanvas.style.setProperty("left", x + "px");
        this.circleCanvas.style.setProperty("top", y + "px");
    }

    appInfoFromEvent(evt) {
        // if dragged from a Q minibrowser, the types will include an
        // item of the form application/x.croquetfave.<appInfo>
        // where appInfo is a JSON-stringified object encoded as an
        // ascii hex string (to ensure that the lowercasing of
        // dataTransfer types doesn't lose any information)
        let appInfo = { appName: "browser", label: "browser", iconName: "link.svgIcon", urlTemplate: null }; // default
        let faveType = evt.dataTransfer.types.find(type => type.includes("x.croquetfave"));
        if (faveType) {
            let encoded = faveType.split(".")[2];
            let json = encoded.match(/.{1,2}/g).map(hex => String.fromCharCode(Number(parseInt(hex, 16)))).join("");
            appInfo = JSON.parse(json);
        }
        return appInfo;
    }

    dragEnter(evt) {
        let dt = evt.dataTransfer;
        if (!dt.types.includes("text/uri-list")) return;

        evt.stopPropagation();
        evt.preventDefault();

        if (this.dragEnterHandled) {
            this.dragEnterSeen = true;
            return;
        }

        this.dragEnterHandled = true;

        let appInfo = this.appInfoFromEvent(evt);
        let { appName, label, iconName, urlTemplate } = appInfo;
        let scaler = window.topView.querySelector("#scaler");
        scaler.call("PasteUpView", "setProvisionalApp", appName, { label, iconName, urlTemplate });
        // setProvisionalApp publishes userAppsChanged, which is
        // handled synchronously.
        // by this point, the "appsChanged" event that causes the tool
        // list to be updated will therefore already have been queued.
        // the "dropHighlightedTool" event will be queued (and processed)
        // after it.
        this.publish(this.sessionId, "dropHighlightedTool", appName);
    }

    dragOver(evt) {
        let dt = evt.dataTransfer;
        if (!dt.types.includes("text/uri-list")) return;

        evt.stopPropagation();
        evt.preventDefault();
        dt.dropEffect = "copy";
    }

    dragLeave(evt) {
        evt.stopPropagation();
        evt.preventDefault();

        // if this leave was preceded by an enter on any
        // element in this region, it's not a real leave
        if (this.dragEnterSeen) {
            this.dragEnterSeen = false; // reset for next time
            return;
        }

        // a real leave
        this.dragEnterHandled = false;
        let scaler = window.topView.querySelector("#scaler");
        scaler.call("PasteUpView", "clearProvisionalApp", false); // false => don't keep
        this.publish(this.sessionId, "dropHighlightedTool", null);
    }

    drop(evt) {
        evt.preventDefault();

        this.dragEnterSeen = this.dragEnterHandled = false;
        this.publish(this.sessionId, "dropHighlightedTool", null);

        let appInfo = this.appInfoFromEvent(evt);
        let url = evt.dataTransfer.getData("URL"); // always supplied
        let pos = { x: evt.clientX + 32, y: evt.clientY };
        let scaler = window.topView.querySelector("#scaler");
        scaler.call("PasteUpView", "nameAndSetFavorite", pos, "user", { url, appInfo });
    }

    windowResize(firstTime) {
        if (firstTime) {
            setTimeout(() => this.dom.style.setProperty("display", "flex"), 20);
        }
        let pad = window.topView.querySelector("#pad");
        if (!pad) {return;}
        let height = pad.dom.clientHeight;

        if (height < 500) {
            this.dom.style.setProperty("transform", "scale(0.3)");
        } else if (height < 750) {
            this.dom.style.setProperty("transform", "scale(0.45)");
        } else if (height < 900) {
            this.dom.style.setProperty("transform", "scale(0.6)");
        } else if (height < 2000) {
            this.dom.style.setProperty("transform", "scale(0.72)");
        } else {
            this.dom.style.removeProperty("transform");
        }
    }
}

class ToolsTabView {
    init() {
        this.addEventListener("click", "ToolsTabView.click");
        this.userWantsHidden = this.isHidden = false; // assumed at the start
        this.updateState();
        console.log("ToolsTabView.init");
    }

    click() {
        // user explicitly asking to flip the hidden state
        this.userWantsHidden = this.isHidden = !this.isHidden;
        this.updateState();
    }

    requestToolsHidden(bool) {
        // unhiding (bool=false) does not override a user-requested hide
        let wasHidden = this.isHidden;
        this.isHidden = bool || this.userWantsHidden;
        if (this.isHidden !== wasHidden) this.updateState();
    }

    updateState() {
        let tools = window.topView.querySelector("#tools");
        if (tools) {
            tools.dom.setAttribute("hiddenState", `${this.isHidden}`);
            let pad = window.topView.querySelector("#pad");
            pad.call("TransformView", "resetToolState");
        }

        let icon = this.dom.querySelector("#icon");
        if (icon) {
            icon.textContent = this.isHidden ? "+" : "-";
        }

    }
}

class BeaconView {
    init() {
        this.lastTime = Date.now();
        this.timeout = null;
    }

    clearTimeout() {
        console.log("beacon: clear timeout", this.timeout);
        if (this.timeout) {
            clearInterval(this.timeout);
            this.timeout = null;
        }
    }

    sendBeacon() {
        if (!window.fromLandingPage) {return;}
        if (!window.fromLandingPage.sessionName) {return;}
        if (!window.Database) {return;}

        /*let radar = window.topView.querySelector("#radar");
        radar.call("RadarView", "render", true);
        let canvas = radar.dom.querySelector("#canvas");
        let dataUrl = canvas.toDataURL();
        */
        let sessionName = window.fromLandingPage.sessionName;
        let boardId = sessionName;
        let sessionId = this.sessionId;
        let guestName = window.fromLandingPage.nickname || "guest";
        let data = {thumbnail: null, boardId, sessionId, viewId: this.viewId, guestName};
        window.Database.postLastUpdated(data);
    }

    schedule() {
        this.clearTimeout();
        this.timeout = setInterval(() => this.sendBeacon(), 30000);
        console.log("schedule beacon", this.timeout);
        this.sendBeacon();
    }
}

function p(parent, _json, persistentData) {
    const BOARD_WIDTH = 20000;
    const BOARD_HEIGHT = 20000;

    // let frameQRIcon = parent.getLibrary("minibrowser.QRIcon").iconString();
    // parent.getLibrary("minibrowser.QRIcon").defaultIcon();
    // parent.getLibrary("minibrowser.QRIcon").defaultDragIcon(32, 32);

    let middle = parent.createElement();
    middle.domId = "middle";
    middle.setViewCode("boards.MiddleView");

    let pad = parent.createElement();
    pad.domId = "pad";
    pad.classList.add("transform-pad");

    pad.style.setProperty("left", "0px");
    pad.style.setProperty("top", "0px");

    let backdrop = parent.createElement();
    backdrop.domId = "middle-backdrop";
    backdrop.classList.add("middle-backdrop");

    let peers = parent.createElement();
    peers.domId = "peers";
    peers.setViewCode("boards.PeerView");

    let videoChat = parent.createElement();
    videoChat.domId = "videoChat";
    // videoChat.setViewCode("videoChat.PeerView");
    videoChat.setViewCode("boards.VideoChatView");

    let vSeparator = parent.createElement();
    vSeparator.domId = "vSeparator";
    vSeparator.setCode("boards.VSeparatorModel");
    vSeparator.setViewCode("boards.VSeparatorView");

    let textChat = parent.createElement();
    textChat.domId = "textChat";
    textChat.setViewCode("boards.TextChatView");

    let separator = parent.createElement();
    separator.domId = "separator";
    separator.setCode("boards.SeparatorModel");
    separator.setViewCode("boards.SeparatorView");

    let peerFrameHolder = parent.createElement();
    peerFrameHolder.domId = "peerFrameHolder";

    peerFrameHolder.appendChild(videoChat);
    peerFrameHolder.appendChild(vSeparator);
    peerFrameHolder.appendChild(textChat);

    let navHolder = parent.createElement();
    navHolder.setViewCode(["widgets.WheelFilterView", "widgets.GestureFilterView"]);
    navHolder.domId = "navHolder";
    navHolder.classList.add("navHolder");

    let navButtonBox = parent.createElement();
    navButtonBox.classList.add("navButtonBox");

    let recenterButton = parent.createElement();
    recenterButton.domId = "recenterButton";
    recenterButton.setCode("widgets.Button");
    recenterButton.call("Button", "beViewButton", "Recenter", "view-centered.svgIcon", "navigation-button navigation-recenter-button", "Recenter");
    recenterButton.addDomain(null, "recenterButton");

    let zoomInButton = parent.createElement();
    zoomInButton.domId = "zoomInButton";
    zoomInButton.setCode("widgets.Button");
    zoomInButton.call("Button", "beViewButton", "ZoomIn", "view-zoom-in.svgIcon", "navigation-button navigation-circle-button", "Zoom In"); // "ZoomIn" state currently ignored
    zoomInButton.addDomain(null, "zoomInButton");

    let zoomOutButton = parent.createElement();
    zoomOutButton.domId = "zoomOutButton";
    zoomOutButton.setCode("widgets.Button");
    zoomOutButton.call("Button", "beViewButton", "ZoomOut", "view-zoom-out.svgIcon", "navigation-button navigation-circle-button", "Zoom Out"); // "ZoomOut" state currently ignored
    zoomOutButton.addDomain(null, "zoomOutButton");

    let presentationButton = parent.createElement();
    presentationButton.domId = "presentationButton";
    presentationButton.classList.add("navigation-button", "navigation-presentation-button");
    presentationButton.setCode("boards.PresentationButtonModel");
    presentationButton.setViewCode("boards.PresentationButtonView");

    navButtonBox.appendChild(recenterButton);
    navButtonBox.appendChild(zoomInButton);
    navButtonBox.appendChild(zoomOutButton);

    navHolder.appendChild(navButtonBox);
    navHolder.appendChild(presentationButton);

    peers.appendChild(separator);
    peers.appendChild(navHolder);
    peers.appendChild(peerFrameHolder);

    let scaler = parent.createElement();
    scaler.domId = "scaler";
    scaler.classList.add("transform-scaler");
    scaler._set("boardWidth", BOARD_WIDTH);
    scaler._set("boardHeight", BOARD_HEIGHT);
    scaler.style.setProperty("-cards-direct-manipulation", true);
    scaler.style.setProperty("-cards-transform-origin", "0 0");
    scaler.setTransform([1, 0, 0, 1, 0, 0]);
    scaler.style.setProperty("width", BOARD_WIDTH + "px");
    scaler.style.setProperty("height", BOARD_HEIGHT + "px");
    scaler.setViewCode(["boards.PasteUpView", "boards.RemoteCursorView"]);
    scaler.setCode("boards.PasteUpModel");

    let tools = parent.createElement();
    tools.domId = "tools";
    tools.addDomain(null, "toolButtonPressed");

    let title = parent.createElement();
    title.domId = "boardTitle";
    title.innerHTML = '<div id="boardTitleIcon" class="no-select"></div>';
    title.setViewCode(["boards.TitleView", "widgets.WheelFilterView", "widgets.GestureFilterView"]);

    // a clickable tab for opening and closing the tool bar
    let toolsTab = parent.createElement();
    toolsTab.domId = "toolsTab";
    toolsTab.setViewCode(["boards.ToolsTabView", "widgets.WheelFilterView", "widgets.GestureFilterView"]);
    let toolsLabel = parent.createElement();
    toolsTab.appendChild(toolsLabel);
    toolsLabel.innerHTML = '<div class="no-select tools-label"><span>APPS</span><span id="icon">-</span></div>';

    let toolsAppRegion = parent.createElement();
    toolsAppRegion.domId = "toolsAppRegion";

    let toolsUtilRegionHolder = parent.createElement();
    toolsUtilRegionHolder.domId = "toolsUtilRegionHolder";

    let toolsUtilRegion = parent.createElement();
    toolsUtilRegion.domId = "toolsUtilRegion";
    toolsUtilRegionHolder.appendChild(toolsUtilRegion);

    let toolsScaler = parent.createElement();
    toolsScaler.domId = "toolsScaler";

    toolsScaler.appendChild(toolsAppRegion);
    toolsScaler.appendChild(toolsUtilRegionHolder);
    toolsScaler.appendChild(toolsTab);

    tools.appendChild(title);
    tools.appendChild(toolsScaler);

    // initialise the tools view once it has its children
    tools.setViewCode(["boards.ToolsView", "boards.AppButtonManager", "widgets.WheelFilterView", "widgets.GestureFilterView"]);

    pad.appendChild(scaler);

    pad.setViewCode(["boards.TransformView", "widgets.GestureFilterView"]);
    pad.setCode("boards.TransformModel");

    let annotation = parent.createElement("CanvasElement");
    annotation.domId = "annotation-canvas";
    annotation.setCode("boards.DrawModel");
    annotation.setViewCode("boards.DrawView");
    annotation._set("canvasId", "annotation-canvas");
    annotation.style.setProperty("pointer-events", "none");

    let cover = parent.createElement();
    cover.domId = "cover";
    cover.style.setProperty("width", "100%");
    cover.style.setProperty("height", "100%");
    cover.style.setProperty("position", "absolute");
    cover.style.setProperty("left", "0px");
    cover.style.setProperty("top", "0px");
    cover.style.setProperty("background-color", "transparent"); // "rgba(255, 255, 0, 0.1");
    cover.style.setProperty("z-index", "10000010");
    cover.style.setProperty("outline", "0px solid transparent"); // suppress focus outline
    cover.style.setProperty("display", "none");
    cover.setViewCode("boards.CoverView");

    middle.appendChild(backdrop);
    middle.appendChild(pad);
    middle.appendChild(annotation);
    middle.appendChild(cover);

    let infoBar = parent.createElement();
    infoBar.domId = "infoBar";
    infoBar.setViewCode(["widgets.WheelFilterView", "widgets.GestureFilterView"]);

    let versionString = parent.createElement();
    versionString.domId = "versionString";
    versionString.classList.add("no-select");
    // versionString.setViewCode("boards.VersionStringView");
    versionString.style.setProperty("display", "none");

    let presenterString = parent.createElement();
    presenterString.domId = "presenterString";
    presenterString.classList.add("no-select");
    presenterString.innerHTML = "";

    let beacon = parent.createElement();
    beacon.domId = "beacon";
    beacon.classList.add("beacon");
    beacon.setViewCode("boards.BeaconView");

    let radar = parent.createElement();
    radar.domId = "radar";
    radar.style.setProperty("display", "none");
    radar.classList.add("radar");
    radar.setCode("boards.RadarModel");
    radar.setViewCode("boards.RadarView");

    let header = parent.createElement();
    header.domId = "header";
    header.classList.add("flap");
    header.setViewCode(["widgets.WheelFilterView", "widgets.GestureFilterView"]);

    let roomName = parent.createElement();
    roomName.domId = "roomName";
    roomName.setCode("boards.RoomNameModel");
    roomName.setViewCode("boards.RoomNameView");

    let roomParticipants = parent.createElement();
    roomParticipants.domId = "room-participants";
    roomParticipants.setCode("boards.RoomParticipantsModel");
    roomParticipants.setViewCode("boards.RoomParticipantsView");

    let annotationButton = parent.createElement();
    annotationButton.domId = "annotationButton";
    annotationButton.classList.add("annotation-button");
    annotationButton.setCode("widgets.Button");
    annotationButton.addCode("boards.AnnotationButtonModel");
    annotationButton.addViewCode("boards.AnnotationButtonView");
    let annotationSvg = annotationButton.call("AnnotationButtonModel", "svg");
    annotationButton.call("Button", "beViewButton", "Annotation", annotationSvg, "marker-button", "Annotation");
    annotationButton.addDomain(null, "annotationButton");

    header.appendChild(roomName);
    header.appendChild(roomParticipants);
    header.appendChild(annotationButton);

    infoBar.appendChild(versionString);
    infoBar.appendChild(presenterString);
    infoBar.appendChild(radar);
    infoBar.appendChild(beacon);

    parent.appendChild(peers);
    parent.appendChild(middle);
    parent.appendChild(tools);
    parent.appendChild(header);
    parent.appendChild(infoBar);

    if (persistentData) {
        scaler.call("PasteUpModel", "loadPersistentData", persistentData);
    }

    return parent;
}

class AssetLibrary {
    avatar(initials, outlineColor, fillColor, initialsColor) {
        // this seems to be called more than necessary.
        return `
<svg width="32px" height="32px" viewBox="0 0 32 34" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <!-- Generator: Sketch 64 (93537) - https://sketch.com -->
    <title>avatar/cursor/small</title>
    <desc>Created with Sketch.</desc>
    <defs>
        <path d="M17,0 L17.0002994,0.0307604489 C25.3708878,0.547104153 32,7.49939602 32,16 C32,24.836556 24.836556,32 16,32 C7.49939602,32 0.547104153,25.3708878 0.0307604489,17.0002994 L0,17 L0,0 L17,0 Z" id="path-1"></path>
        <filter x="-15.6%" y="-12.5%" width="131.2%" height="131.2%" filterUnits="objectBoundingBox" id="filter-2">
            <feOffset dx="0" dy="1" in="SourceAlpha" result="shadowOffsetOuter1"></feOffset>
            <feGaussianBlur stdDeviation="1.5" in="shadowOffsetOuter1" result="shadowBlurOuter1"></feGaussianBlur>
            <feColorMatrix values="0 0 0 0 0   0 0 0 0 0   0 0 0 0 0  0 0 0 0.203780594 0" type="matrix" in="shadowBlurOuter1" result="shadowMatrixOuter1"></feColorMatrix>
            <feOffset dx="0" dy="0.5" in="SourceAlpha" result="shadowOffsetOuter2"></feOffset>
            <feGaussianBlur stdDeviation="0.5" in="shadowOffsetOuter2" result="shadowBlurOuter2"></feGaussianBlur>
            <feColorMatrix values="0 0 0 0 0   0 0 0 0 0   0 0 0 0 0  0 0 0 0.304223121 0" type="matrix" in="shadowBlurOuter2" result="shadowMatrixOuter2"></feColorMatrix>
            <feMerge>
                <feMergeNode in="shadowMatrixOuter1"></feMergeNode>
                <feMergeNode in="shadowMatrixOuter2"></feMergeNode>
            </feMerge>
        </filter>
    </defs>
    <g id="avatar/cursor/small" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
        <g id="Combined-Shape">
            <use fill="black" fill-opacity="1" filter="url(#filter-2)" xlink:href="#path-1"></use>
            <use fill="${outlineColor}" fill-rule="evenodd" xlink:href="#path-1"></use>
        </g>
        <path d="M17,2 L17.0008661,2.0352252 C24.2657313,2.54839185 30,8.60454082 30,16 C30,23.7319865 23.7319865,30 16,30 C8.94734804,30 3.11271995,24.7850199 2.14189822,18.0008423 L2,18 L2,2 L17,2 Z" id="Combined-Shape" fill="${fillColor}"></path>
        <text id="TD" font-family="Poppins-Medium, Poppins, sans-serif" font-size="13" font-weight="500" fill="${initialsColor}">
            <tspan x="7.0" y="20">${initials}</tspan>
        </text>
    </g>
</svg>`;
    }

    faveIndicator(style) {
        // adapted from https://www.svgrepo.com/svg/82321/star-half-empty
        let fill, stroke;
        switch (style) {
            case "session":
                fill = stroke = "#AA0000";
                break;
            case "user":
                fill = stroke = "#EFCF00";
                break;
            case "menu_add":
                fill = stroke = "black";
                break;
            case "menu_remove":
            default:
                fill = "transparent";
                stroke = "black";
        }
        return `
<svg version="1.1" id="Capa_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
         width="16px" height="16px" viewBox="0 0 36.09 36.09" style="enable-background:new 0 0 36.09 36.09;" xml:space="preserve"
        >
<g>
        <path style="fill:${fill};stroke:${stroke};" d="M36.041,13.907c-0.123-0.377-0.456-0.646-0.85-0.687l-11.549-1.172L18.96,1.431c-0.16-0.364-0.519-0.598-0.915-0.598
                s-0.755,0.234-0.915,0.598l-4.683,10.618L0.899,13.221c-0.394,0.04-0.728,0.31-0.85,0.688c-0.123,0.377-0.011,0.791,0.285,1.055
                l8.653,7.736L6.534,34.044c-0.083,0.387,0.069,0.787,0.39,1.021c0.322,0.231,0.75,0.254,1.091,0.056l10.031-5.839l10.031,5.839
                c0.156,0.091,0.33,0.136,0.503,0.136c0.207,0,0.413-0.064,0.588-0.191c0.32-0.23,0.474-0.633,0.391-1.02L27.105,22.7l8.652-7.737
                C36.052,14.698,36.164,14.284,36.041,13.907z"/>
</g>
</svg>
`;
    }

    greenlightLogo() {
        // assets/bitmaps/greenlight-logo.png
        return "url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC0AAAAtCAYAAAA6GuKaAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAABb5JREFUeNrsWUtPW0cUPvdlDI0EqKhQAZFBCKWhUo1EdqmKK6VpQ6WSXXcNK5ahvyDpL2hZsiL5AW2hmy7ShStVAZRC6TZU6t2AQUpqGz+v76vnzMylxjXch21gkbEOA76Xud+c+c53zswFeNPetDOb1K6BFhcXZ7Ej+wCtT3w9K3pdGLVfxe/plZUV/cJBI9B57L5Cm484xC7aMtoaTiDXUdAI9gF2j9ASbVooAryMwB+3HTSCTWK3ipbsEF3J8wsIfve8m5SQ3v0ZbaiDMUZjfzkzM3O0vb2925KnETB598EFi8R99PhaJNCXBNjjeaoZVWQfwEuXBBiEbK4ihr7AoEXQfXvJeSQpVCqwp1evSAJcQgcmfEELWiTh6rRV30BE0Nm6VByqjY2Pw/DwMFwfvQ4ufvb3D+DwMAMH+/tQLBZbAT7tBaV6hh6HBjw19T7c+eQOjI6MgCwr4LoOmKYFN268B7VaDYqFAuzs7MDm1iaY+HeIlkZ7Wq8iapObvggLeG7uc0ilUtAV7wJF5oxzHAckSWa967rw1rVrMHPrFrwzOAi/PHsG+bxvqfFEpPbdc3VayEs2DOB7CPhjAtyFgBUZgUoMJIG1LJt5uWbW0LsmVKpVKJVKkMkcwE/r63jdahxOFwXUk/MKqEZPz4YBPDExAR/evg2qxochsF7PDD8yTkRxFHAUByelMOvt7YXp5DS8+P1FPQWWz8qAfqBDKcZn9+YgFtMIJQMoMAvAwLwuoxFlbDQZTUG+Uz84NAj9/f3pbDa7ELaubpS8j4L+48DAAAwiPwkYSKdFiL7zPh4LvQl4XxHfxxNjepSNgBxVfyYnJxmHPUo0a9zfdbQRPxzbQbORVtpslGc30iNwUc9lTVCBFAK96JAHxRwclDzXoYDk/Ka/KThtx8YANFEOaxiUxcSFgnaEQhAoSXI4BWROCcZvx7suDD1ro1oQWMMwmJmmCe0AHbg56DECYsnEUz6M5Ep11zlom8DivZRoaih7RqUKlXIFKpUKWKaltwP0blAFOcxkUH9NHohEVaQL+5V+uO4JaJocabRRM6BcLkGxVMR0XmDAy5Uy5YbHIfCSfutqk8I7UNN1HV6/egVvo4pojgqO6qA6yFwdXM5pCjiaGFGhWCyxVH6cP4bCcYElnONCIdGs9PRJ6bocFTS1jc0NtsxVBFWtGqwngFWjClWkQRmvlTEDFo7zUMC0nctmIZfLosfLjM+UHdtBjz/DnGH8gQXQKFZziUQCVFVlSYPowqhhW3wCVQ48jx4mwAX0Nqv+DjKRyz21ifsfBQtElwXZjz98D3fvforgR1iK9ooliwUe8bjCOEyUqOAESP5e7u2xVVAVlWl9yydMQWpperCNfDVRb2tGjanD1M2bkEwmGRBHqIVhcKUguhC/X2f/YYCpiKICKxaL4f08rQdstNFNN5O8tSCbWV5rcCMa/Pb8OWxsbcG7Q0MwipsAW8gdtWwuB4dHR0iRPHR3d0MPGtduNKKU656oUFSdfhoENCURUguq4ojP5Dny+t+oKi/3/gLLtk7qELoe0zSIx+OgYS+L4omS0emULwU6iPkfaHI/UiR9XpnKih98IHFYczWmzQwYLjdlPaIO7Vy8ao9Vd3gv3UOmqcRlHriyVFdUtZgRv/GrrT0eSrIGio2lJ4EWKZtSuFcseZMkUGyiBFTw2FObsMegTSOAvI3dd/5Fk8wCiZa8C70cR4p0IwWIt571dPfwvodzmWhE95Pnw/A4aO3heds3rbP6uRGA244T8JD1tNij3Q+bJU+JaQcA+24CxK4iBf+9euj0gWO6LTsXsYWfDjpgxEbxM4bPIgct+K1u2DcBSyLN97UJLDni68azDXGUQc9ZapYRQ7NODEiDPWwB/Jo4Mkj7PMs7uZ1tCXTDoPNiB5/00XVdbDDWIcKruLoXUwstgz7HO94K6FHfFZ6xwhDm1d2Vav8KMADaY/Xd3BmUdwAAAABJRU5ErkJggg==')";
    }
}

/* eslint-disable import/first */
import {supplemental} from "./pitch-supplemental.js";
import {PasteUpSaver} from "./pitch-saver.js";
import {PasteUpSaver3} from "./pitch-saver3.js";
import {AppButton, UtilityButton, FileButton} from "./pitch-tool-buttons.js";
import {drawing} from "./pitch-drawing.js";

export const boards = {
    expanders: [
        TransformModel, TransformView,
        CoverView,
        PasteUpModel, PasteUpView,
        AppButtonManager,
        RemoteCursorView,
        VideoChatView, TextChatView,
        ToolsView, ToolsTabView,
        BeaconView,
        supplemental.TitleView, supplemental.MiddleView, supplemental.PeerView,
        supplemental.FrameModel, supplemental.FrameView, supplemental.FrameResizeModel,
        supplemental.FrameResizeView, supplemental.FrameMoveView, supplemental.FrameMenuModel,
        supplemental.FrameMenuView, supplemental.FrameLockModel, supplemental.FrameLockView,
        supplemental.FrameTrashModel, supplemental.FrameTrashView,
        supplemental.FrameAddressEditModel, supplemental.FrameAddressEditView,
        supplemental.RadarModel, supplemental.RadarView, supplemental.RadarButtonView,
        supplemental.VSeparatorModel, supplemental.VSeparatorView,
        supplemental.SeparatorModel, supplemental.SeparatorView,
        supplemental.ScaleReadOutModel, supplemental.ScaleReadOutView,
        supplemental.PresentationButtonModel, supplemental.PresentationButtonView,
        supplemental.VersionStringView,
        supplemental.AnnotationButtonModel, supplemental.AnnotationButtonView,
        supplemental.RoomNameModel, supplemental.RoomNameView,
        supplemental.RoomParticipantsModel, supplemental.RoomParticipantsView,
        ...drawing.expanders,
    ],
    functions: [p],
    classes: [PasteUpSaver, PasteUpSaver3, AppButton, UtilityButton, FileButton, AssetLibrary, ...drawing.classes]
};
