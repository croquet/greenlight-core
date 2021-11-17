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

class TitleView {
    init() {
        this.addEventListener("click", "click");

        let Cls = this.model.getLibrary("boards.AssetLibrary");
        let assetLib = new Cls();
        let title = this.dom.querySelector("#boardTitleIcon");
        title.style.setProperty("background-image", assetLib.greenlightLogo());
        console.log("TitleView init");
    }

    click() {
        this.toggleQR();

        /*

        if (this.titlesMenu) {
            this.hideTitleMenu();
        } else {
            this.startTitleMenu();
        }
        */
    }

    startTitleMenu() {
        let menu = this.makeMenu();
        this.titleMenu = menu;

        let cover = window.topView.querySelector("#cover");
        if (!cover) {return;}
        cover.call("CoverView", "addMenu", {menu, placeElement: this});
    }

    hideTitleMenu() {
        if (this.titleMenu) {
            this.titleMenu.remove();
            this.titleMenu = null;
        }
    }


    toggleQR() {
        if (this.qrElement) {
            window.topView.querySelector("#tools").dom.removeChild(this.qrElement);
            delete this.qrElement;
        } else {
            const { App } = Croquet;
            const qrDiv = this.qrElement = document.createElement("div");
            qrDiv.id = "qr";
            window.topView.querySelector("#tools").dom.appendChild(qrDiv);

            const url = App.sessionURL = window.location.href;
            const qrCode = App.makeQRCanvas();

            qrDiv.innerHTML = `<p class="no-select">Scan to join</p>`;
            qrDiv.onclick = evt => {
                evt.preventDefault();
                evt.stopPropagation();
                window.open(url);
            };

            // document.head.appendChild(style);
            qrDiv.appendChild(qrCode);
        }

    }

    makeMenuItem(assetName, value, label) {
        let opt = document.createElement("div");

        if (value === null) {
            opt.classList.add("no-select", "frame-menu-title");
            opt.innerHTML = `<span>${label}</span>`;
            return opt;
        }
        opt.classList.add("no-select", "frame-menu-item");

        let html = "";
        if (assetName) {
            let sectionName = "img-" + assetName;
            html = `<div class="frame-menu-icon"><svg viewBox="0 0 24 24" class="frame-menu-icon-svg"><use href="#${sectionName}"></use></svg></div>`;
        }
        html += `<span class="frame-menu-label">${label}</span>`;
        opt.innerHTML = html;
        opt.value = value;
        opt.addEventListener("click", (evt) => this.menuSelected(evt), true);
        return opt;
    }

    makeMenu() {
        let items = [
            {value: null, label: "MAIN MENU"},
            {value: "saveContents", label: "Save"},
            {value: "saveContentsAs", label: "Save As..."},
            {value: "loadContents", label: "Load"},
            {value: "loadContentsFrom", label: "Load From..."}
        ];

        if (this.qrElement) {
            items.push({value: "toggleQR", label: "Hide QR Code"});
        } else {
            items.push({value: "toggleQR", label: "Show QR Code"});
        }

        let DOMMenu = this.model.getLibrary("widgets.DOMMenu");
        let holder = document.createElement("div");
        (new DOMMenu()).makeMenu(holder, "frame-menu", items, this, this.menuSelected);
        return holder;
    }

    menuSelected(evt) {
        let value = evt.currentTarget.value;

        this.hideTitleMenu();

        let scaler = window.topView.querySelector("#scaler");
        let cover = window.topView.querySelector("#cover");
        if (!cover) {return;}
        cover.call("CoverView", "deactivate");

        let pos = { x: evt.clientX + 32, y: evt.clientY };

        if (value === "saveContents") {
            scaler.call("PasteUpView", "saveRequest", pos);
        } else if (value === "saveContentsAs") {
            scaler.call("PasteUpView", "saveRequest", pos, true);
        } else if (value === "loadContents") {
            scaler.call("PasteUpView", "loadRequest", pos);
        } else if (value === "loadContentsFrom") {
            scaler.call("PasteUpView", "loadRequest", pos, true);
        } else if (value === "toggleQR") {
            this.toggleQR();
        }
    }

    requestToolsHidden(bool) {
        if (bool) {
            this.dom.classList.add("hidden");
            this.hideTitleMenu();
        } else {
            this.dom.classList.remove("hidden");
        }
    }
}

class MiddleView {
    enablePointerMoveHandler() {
        this.addEventListener("pointermove", "pointerMove");
    }

    disablePointerMoveHandler() {
        this.removeEventListener("pointermove", "pointerMove");
    }

    ensureScaler() {
        if (!this.scaler) {
            this.scaler = window.topView.querySelector("#scaler");
        }
        return this.scaler;
    }

    pointerMove(evt) {
        // console.log("MiddleView.pointerMove");
        evt.preventDefault();
        evt.stopPropagation();

        this.ensureScaler();
        this.scaler.call("PasteUpView", "pointerMove", evt, true);
    }
}

class PeerView {
    init() {
        this.dom.style.setProperty("top", "0px");
        this.dom.style.setProperty("height", "100%");
        let innerWidth = window.innerWidth;
        let ratio = 0.4;
        if (window.fromLandingPage && window.fromLandingPage.chat === "textOnly") {
            ratio = 0.12;
        }

        let peerWidth = 100 + (innerWidth - 700) * ratio;
        peerWidth = Math.min(Math.max(100, peerWidth), 450);

        if (!window.fromLandingPage || window.fromLandingPage.chat === "off") {
            peerWidth = 0;
        }

        this.dom.style.setProperty("width", peerWidth + "px");
    }
}

class FrameModel {
    setObject(elem, initPos) {
        this._set("target", elem.asElementRef());
        this.initElementsFor(elem);

        if (initPos) {
            let {x, y} = initPos;
            let t = [1, 0, 0, 1, x, y];
            this.setTransform(t);
        }

        this.subscribe(this.id, "qrState", "qrState");
        this.subscribe(this.sessionId, "presentationStopped", "presentationStopped");
        this.subscribe(this.id, "requestInteraction", "requestInteraction");
        this.subscribe(this.id, "endInteraction", "endInteraction");
    }

    getTitleHeight() {
        return 35; // @@ style dependent; needed for position-setting interactions, including creation
    }

    initElementsFor(elem) {
        if (this.title) {return;}

        let frameType = elem._get("desiredFrameType");
        this._set("frameType", frameType);

        let pad = this.createElement();
        pad.domId = "pad";
        pad.classList.add("frame-pad");
        // to mitigate a presumed browser bug that occurs only
        // on some combination of OS and browser version.
        // (introduced as 0.99 on 21 may 2020 in commit 046234d4,
        // "some experiments to address scroll bar issues";
        // updated feb 2021 to quash distracting see-through
        // effects).
        pad.style.setProperty("opacity", "0.99999999");

        pad.appendChild(elem);
        this.pad = pad;

        this.classList.add("frame-frame");
        this.style.setProperty("-cards-direct-manipulation", true);
        this.setTransform(`1,0,0,1,0,0`);
        this.style.setProperty("position", "absolute");

        let trash = this.createElement();
        trash.domId = "trash";
        trash.setCode("boards.FrameTrashModel");
        trash.setViewCode(["boards.FrameTrashView", "widgets.PointerDownFilterView", "widgets.DoubleClickFilterView"]);
        trash.classList.add("frame-trash-button");

        let title = this.createElement();
        title.domId = "title";
        title.classList.add("frame-title");
        title.setViewCode("boards.FrameMoveView");

        if (frameType === "stickyNote") {
            this.classList.add("sticky-note");
            pad.classList.add("sticky-note");
            title.classList.add("sticky-note");
            trash.classList.add("sticky-note");
        }

        if (this._get("hasAddressBar")) {
            this.addQRButton(title);
            this.addAddress(title);
        }

        /*
        let lock = this.createElement();
        lock.domId = "lock";
        lock.setCode("boards.FrameLockModel");
        lock.setViewCode(["boards.FrameLockView", "widgets.PointerDownFilterView"]);
        lock.classList.add("frame-lock-button");

        title.appendChild(lock);
        */

        title.appendChild(trash);
        this.appendChild(title);
        this.appendChild(pad);

        this.title = title;

        ["left", "right", "top", "bottom"].forEach(edge => {
            let resizer = this.createElement();
            resizer.domId = `resizer-${edge}`;
            resizer.classList.add("frame-resize-edge", `edge-${edge}`);
            if (frameType === "stickyNote") {
                resizer.classList.add("sticky-note");
            }
            resizer.setCode("boards.FrameResizeModel");
            resizer.setViewCode("boards.FrameResizeView");
            let isX = edge === "left" || edge === "right";
            resizer.call("FrameResizeModel", "setEdges", isX ? edge : null, isX ? null : edge);
            this.appendChild(resizer);
        });

        ["left", "right"].forEach(xEdge => {
            ["top", "bottom"].forEach(yEdge => {
                let resizer = this.createElement();
                resizer.domId = `resizer-${xEdge}-${yEdge}`;
                resizer.classList.add("frame-resize-corner", `x-${xEdge}`, `y-${yEdge}`);
                if (frameType === "stickyNote") {
                    resizer.classList.add("sticky-note");
                }
                resizer.setCode("boards.FrameResizeModel");
                resizer.setViewCode("boards.FrameResizeView");
                resizer.call("FrameResizeModel", "setEdges", xEdge, yEdge);
                this.appendChild(resizer);
            });
        });

        this._set("showBorder", true);
        this._set("background", null);
        this._set("locked", false);
        this._set("showBorder", true);
        this._set("active", false);
        this._set("frameUser", null);
        this._set("interactionStatus", {});
        this._set("qrState", null); // null: don't care, true: all replicas should show, false: all replicas should hide

        this.interactionTimeout = 5000; // constant
        this.checkLockExpiry();
    }

    addAddress(title) {
        let targetInfo = this._get("target");
        if (!targetInfo) { return; }
        let target = this.getElement(targetInfo);
        if (!target) { return; }

        let address = this.createElement("TextElement");
        address.domId = "externalAddress";
        address.classList.add("frame-external-address");

        address.style.setProperty("-cards-text-singleLine", true);
        address.style.setProperty("-cards-text-margin", "0px 0px 0px 4px");

        address.setDefault("Poppins-Medium", 16);
        address._set("enterToAccept", true);

        target._set("addressBarInfo", address.asElementRef());
        target.subscribe(address.id, "text", "MiniBrowser.urlFromText");
        title.appendChild(address);

        let addressEdit = this.createElement();
        addressEdit.domId = "addressEdit";
        addressEdit.setCode("boards.FrameAddressEditModel");
        addressEdit.setViewCode(["boards.FrameAddressEditView", "widgets.PointerDownFilterView", "widgets.DoubleClickFilterView"]);
        addressEdit.classList.add("frame-address-edit-button");
        title.appendChild(addressEdit);
    }

    addQRButton(title) {
        let button = this.createElement();
        button.domId = "frame-qr-button";
        button.setViewCode(["minibrowser.QRView", "widgets.DoubleClickFilterView"]);
        button.classList.add("frame-qr-button");
        title.appendChild(button);
    }

    qrState(state) {
        this._set("qrState", state);
        this.stateChanged();
    }

    presentationStopped() {
        this._set("qrState", null);
        // no need to publish the change
    }

    stateChanged() {
        this.publish(this.id, "frameStateChanged");
    }

    beSolidBackground() {
        /* feb 2021: temporarily removed, as interfering with transparency
        this._set("background", "#222222");
        this.style.setProperty("background-color", "#222222");
        */
    }


    // interaction-lock management

    // a view submits an interaction request with an "updates"
    // object listing properties and their desired values.
    // the first time a view V is heard from, the model decides
    // which - if any - of the named properties are available
    // for V to be granted control over.
    // from that point forward - until V explicitly ends this
    // interaction, or times out by leaving too long a gap
    // between requests - each request from V is filtered to
    // just the properties for which V has control.  if there
    // are none, the request is silently ignored.
    requestInteraction({ requester, scope, event, data }) {
        const requestedUpdates = data.updates;
        const allowedProperties = this.lockOrFilter(requester, Object.keys(requestedUpdates));
        if (allowedProperties.length === 0) return;

        this.publish(this.id, "interactionStateChanged");

        if (!event) return; // just reserving the locks before interacting

        const allowedUpdates = {};
        allowedProperties.forEach(prop => allowedUpdates[prop] = requestedUpdates[prop]);
        const filteredData = { ...data, updates: allowedUpdates };
        this.publish(scope, event, filteredData);
    }

    endInteraction({ scope, event, requester, data }) {
        // a view is ending an interaction.  release the locks
        // being held for that view and, iff that leaves no more
        // locks in this model, publish the specified event.
        const viewState = this._get("interactionStatus")[requester];
        if (viewState) {
            delete viewState.interacting;
            if (viewState.heldLocks.length) {
                this.releaseLocks(requester);
            }
        }

        for (const state of Object.values(this._get("interactionStatus"))) {
            if (state.heldLocks.length) return;
        }

        this.publish(scope, event, data);
    }

    releaseLocks(viewId) {
        const viewState = this._get("interactionStatus")[viewId];
        viewState.heldLocks.length = 0;

        this.publish(this.id, "interactionStateChanged");
    }

    lockHolder(property) {
        for (const [viewId, state] of Object.entries(this._get("interactionStatus"))) {
            if (state.heldLocks.includes(property)) return viewId;
        }
        return null;
    }

    lockOrFilter(viewId, requestedProperties) {
        let viewState = this._get("interactionStatus")[viewId];
        if (!viewState) {
            viewState = this._get("interactionStatus")[viewId] = { heldLocks: [] };
        }

        let granted;
        if (!viewState.interacting) {
            viewState.interacting = true;
            granted = requestedProperties.filter(prop => !this.lockHolder(prop));
            viewState.heldLocks = granted;
        } else granted = viewState.heldLocks;

        const grantedProperties = requestedProperties.filter(prop => granted.includes(prop));
        // if any locks are granted (or continuing) for the view,
        // refresh the lock-approval time.
        if (grantedProperties.length) viewState.lockTime = this.now();
        return grantedProperties;
    }

    checkLockExpiry() {
        for (const [viewId, state] of Object.entries(this._get("interactionStatus"))) {
            const { heldLocks, lockTime } = state;
            if (heldLocks.length && this.now() - lockTime >= this.interactionTimeout) {
                this.releaseLocks(viewId);
            }
        }

        this.future(500).call("FrameModel", "checkLockExpiry");
    }
}

class FrameView {
    init() {
        this.addEventListener("pointerenter", "pointerEnter");
        this.addEventListener("pointerleave", "pointerLeave");
        this.subscribe(this.model.id, "frameStateChanged", "frameStateChanged");
        this.subscribe(this.model.id, "interactionStateChanged", "interactionStateChanged");

        this.subscribe(this.sessionId, "presentationStarted", "presentationStarted");
        this.subscribe(this.sessionId, "followingChanged", "followingChanged");

        this.dom.setAttribute("pointerEntered", "false");
        this.dom.setAttribute("showBorder", `${this.model._get("showBorder")}`);

        this.setupQRButton();
        this.interactionStateChanged();
        this.frameStateChanged();
    }

    pointerEnter() {
        this.dom.setAttribute("pointerEntered", "true");

        if (this.model._get("background")) {
            this.dom.style.setProperty("background-color", this.model._get("background"));
        }
    }

    pointerLeave() {
        if (this.dom.getAttribute("interacting") === "true" || this.menuIsActive) {return;}
        this.dom.setAttribute("pointerEntered", "false");
    }

    setupQRButton() {
        this.pad = window.topView.querySelector("#pad");
        this.qrButton = this.querySelector("#frame-qr-button");
        if (this.qrButton) {
            this.qrButton.call("QRView", "setFrameView", this.id);
        }
        this.subscribe(this.id, "qrState", "qrState");
    }

    qrState(state) {
        let presenterId = this.pad.call("TransformView", "getPresenter");
        if (presenterId !== this.viewId) return;

        this.publish(this.model.id, "qrState", state);
    }

    presentationStarted() {
        let presenterId = this.pad.call("TransformView", "getPresenter");
        if (presenterId !== this.viewId) return;
        this.publish(this.model.id, "qrState", this.model._get("qrState"));
    }

    followingChanged() {
        this.frameStateChanged();
    }

    getRect() {
        let pad = this.dom.querySelector("#pad");
        if (!pad) {return null;}
        let child = pad.firstChild;
        if (!child) {return null;}
        let w = child.style.getPropertyValue("width");
        let h = child.style.getPropertyValue("height");
        let t = this.dom.style.getPropertyValue("transform");

        if (!w || !h || !t) {return null;}

        t = t.split(",");
        let left = parseFloat(t[4]);
        let top = parseFloat(t[5]);
        return {width: parseFloat(w), height: parseFloat(h), x: left, y: top};
    }

    frameStateChanged() {
        this.dom.setAttribute("locked", this.model._get("locked") ? "true" : "false");
        this.dom.setAttribute("showBorder", `${this.model._get("showBorder")}`);

        if (this.qrButton && this.pad.following) {
            if (this.model._get("qrState") === true) {
                this.qrButton.call("QRView", "show");
            } else if (this.model._get("qrState") === false) {
                this.qrButton.call("QRView", "hide");
            }
        }
    }

    interactionStateChanged() {
        const status = this.model._get("interactionStatus");
        const blur = "2px";
        const wholeSpread = "4px";
        const cornerOffset = "3px", cornerSpread = "1px";
        const singleOffset = "6px", singleSpread = "-2px";
        const shadows = [];

        let isStickyNote = this.model._get("frameType") === "stickyNote";
        for (const [viewId, state] of Object.entries(status)) {
            let locks = state.heldLocks;
            if (isStickyNote) {
                locks = locks.filter(l => l !== "top");
            }
            if (locks) {
                const color = window.topView.querySelector("#scaler").call("PasteUpView", "getUserColor", viewId);
                if (locks.length === 4) {
                    if (!isStickyNote) {
                        // one shadow to rule them all
                        shadows.push(`0 0 ${blur} ${wholeSpread} ${color}`);
                    }
                } else {
                    const handledEdges = {};
                    // first add corners (if there are three edges, it's ok for one edge to be shadowed twice)
                    let yEdges = isStickyNote ? ["bottom"] : ["top", "bottom"];
                    yEdges.forEach(yEdge => {
                        if (locks.includes(yEdge)) {
                            [ "left", "right" ].forEach(xEdge => {
                                if (locks.includes(xEdge)) {
                                    const xOffset = `${xEdge === "left" ? "-" : ""}${cornerOffset}`;
                                    const yOffset = `${yEdge === "top" ? "-" : ""}${cornerOffset}`;
                                    shadows.push(`${xOffset} ${yOffset} ${blur} ${cornerSpread} ${color}`);
                                    handledEdges[xEdge] = true;
                                    handledEdges[yEdge] = true;
                                }
                            });
                        }
                    });
                    // then edges that aren't part of corners
                    locks.forEach(edge => {
                        if (!handledEdges[edge]) {
                            let geom;
                            switch (edge) {
                                case "top":
                                    geom = `0 -${singleOffset}`;
                                    break;
                                case "right":
                                    geom = `${singleOffset} 0`;
                                    break;
                                case "bottom":
                                    geom = `0 ${singleOffset}`;
                                    break;
                                case "left":
                                    geom = `-${singleOffset} 0`;
                                    break;
                                default:
                            }
                            shadows.push(`${geom} ${blur} ${singleSpread} ${color}`);
                        }
                    });
                }
            }
        }

        if (shadows.length) {
            this.dom.style.setProperty("box-shadow", shadows.join(","));
        } else {
            this.dom.style.setProperty("box-shadow", null);
        }
    }
}

class FrameMoveView {
    init() {
        // the model is a FrameModel
        let model = this.getModel();
        if (!model) {return;}

        this.addEventListener("pointerdown", "pointerDown");
        this.addEventListener("dblclick", "doubleClick");
        this.subscribe(model.id, "frameStateChanged", "frameStateChanged");
        this.frameStateChanged();
        // console.log("FrameMoveView.init");
    }

    frameStateChanged() {
        let model = this.getModel();
        if (!model) {return;}
        this.dom.setAttribute("locked", model._get("locked") ? "true" : "false");
    }

    getScaler() {
        if (!this.scaler) {
            this.scaler = window.topView.querySelector("#scaler");
        }
        return this.scaler;
    }

    getPad() {
        if (!this.pad) {
            this.pad = window.topView.querySelector("#pad");
        }
        return this.pad;
    }

    getView() {
        // the FrameView
        return this.parentNode;
    }

    getModel() {
        // the FrameModel
        let view = this.getView();
        return view && view.model;
    }

    getEmbeddedObject() {
        // the embedded object, e.g., miniBrowser
        let frameModel = this.getModel();
        let embedInfo = frameModel && frameModel._get("target");
        return embedInfo && frameModel.getElement(embedInfo);
    }

    pointerDown(evt) {
        // console.log("FrameMoveView.pointerDown", evt);
        if (evt.buttons !== 1) {return;}
        evt.preventDefault();
        evt.stopPropagation();
        this.setPointerCapture(evt.pointerId);

        let opacity = this.dom.style.getPropertyValue("opacity");
        if (opacity === "0") {return;}

        let view = this.getView();
        if (!view) { return; }

        let frameModel = this.getModel();
        if (!frameModel) {return;}
        if (frameModel._get("locked")) {return;}

        // the object within the frame (e.g., miniBrowser)
        let embeddedObject = this.getEmbeddedObject();
        if (!embeddedObject) { return; }

        let frameInfo = frameModel.asElementRef();
        this.publish(this.sessionId, "bringToFront", { target: frameInfo, viewId: this.viewId });

        this.addEventListener("pointermove", "pointerMove");
        this.addEventListener("pointerup", "pointerUp");
        this.addEventListener("pointercancel", "pointerUp");
        this.addEventListener("lostpointercapture", "pointerUp");

        view.dom.setAttribute("interacting", "true");

        let scaler = this.getScaler();
        let pad = this.getPad();
        let zoom = scaler.currentZoom;
        let translation = scaler.currentTranslation;
        let visibleRect = pad.dom.getBoundingClientRect();
        let xRaw = clientX => Math.round((translation.x + clientX - visibleRect.x) / zoom);
        let yRaw = clientY => Math.round((translation.y + clientY - visibleRect.y) / zoom);

        this.origDownPoint = { x: xRaw(evt.clientX), y: yRaw(evt.clientY) };
        let domRect = view.dom.getBoundingClientRect();
        this.origRect = { top: yRaw(domRect.top), bottom: yRaw(domRect.bottom), left: xRaw(domRect.left), right: xRaw(domRect.right) };

        this.resizeTarget = embeddedObject;

        this.publish(frameModel.id, "requestInteraction", {
            requester: this.viewId,
            data: {
                updates: { top: true, bottom: true, left: true, right: true }
            }
        });
    }

    pointerMove(evt) {
        // console.log("FrameMoveView.pointerMove", evt);
        evt.preventDefault();
        evt.stopPropagation();

        let frameModel = this.getModel();
        if (!frameModel) {return;}

        let frameInfo = frameModel.asElementRef();
        let resizeTargetInfo = this.resizeTarget.asElementRef();
        let viewId = this.viewId;
        let scaler = this.getScaler();

        // find the drag-point's coordinates on the unscaled scaler
        let zoom = scaler.currentZoom;
        let translation = scaler.currentTranslation;
        let visibleRect = this.pad.dom.getBoundingClientRect();
        let dragPointX = Math.round((translation.x + evt.clientX - visibleRect.x) / zoom);
        let dragPointY = Math.round((translation.y + evt.clientY - visibleRect.y) / zoom);

        let origDownPoint = this.origDownPoint;
        let deltaX = dragPointX - origDownPoint.x;
        let deltaY = dragPointY - origDownPoint.y;

        let origRect = this.origRect;
        let top = origRect.top + deltaY;
        let bottom = origRect.bottom + deltaY;
        let left = origRect.left + deltaX;
        let right = origRect.right + deltaX;

        let publisher = () => this.publish(frameModel.id, "requestInteraction", {
            requester: viewId,
            scope: frameModel.sessionId,
            event: "moveObjectEdges",
            data: {
                target: resizeTargetInfo, viewId, frameInfo,
                updates: { top, bottom, left, right }
            }
        });

        window.topView.throttledInvoke("moveObjectEdges", scaler.throttleBaseMS, publisher);

        let pad = this.getPad();
        pad.call("TransformView", "clearRestoreViewportIfSameFrame", frameModel.id);
    }

    pointerUp(_evt) {
        // console.log("FrameMoveView.pointerUp", _evt);
        this.releaseAllPointerCapture();

        this.removeEventListener("pointermove", "pointerMove");
        this.removeEventListener("pointerup", "pointerUp");
        this.removeEventListener("pointercancel", "pointerUp");
        this.removeEventListener("lostpointercapture", "pointerUp");

        window.topView.clearThrottledInvoke("moveObjectEdges");

        let view = this.getView();
        if (!view) {return;}

        view.dom.setAttribute("interacting", "false");

        let frameModel = this.getModel();
        if (!frameModel) { return; }

        let frameInfo = frameModel.asElementRef();
        let viewId = this.viewId;
        this.publish(frameModel.id, "endInteraction", {
            scope: frameModel.sessionId,
            event: "resizeOrMoveEnd",
            requester: viewId,
            data: { frameInfo, viewId }
        });
    }

    doubleClick(evt) {
        evt.preventDefault();
        evt.stopPropagation();

        let view = this.getView();
        if (!view) { return; }

        let frameModel = this.getModel();
        if (!frameModel) { return; }

        let scaler = this.getScaler();
        let pad = this.getPad();

        // if this frame is being double-clicked a second time, with
        // no zoom/pan adjustments in between, the TransformView will
        // restore the viewport to its state before the first.
        if (pad.call("TransformView", "restoreViewportIfSameFrame", frameModel.id)) return; // true means that the viewport was restored

        let zoom = scaler.currentZoom;
        let translation = scaler.currentTranslation;
        let visibleRect = pad.dom.getBoundingClientRect();
        let domRect = view.dom.getBoundingClientRect();
        // add a margin to left, right and bottom, of size equal to title height
        let titleHeight = frameModel.call("FrameModel", "getTitleHeight");
        let x = (translation.x + domRect.left - visibleRect.x) / zoom;
        x -= titleHeight;
        let y = (translation.y + domRect.top - visibleRect.y) / zoom;
        let width = domRect.width / zoom;
        width += titleHeight * 2;
        let height = domRect.height / zoom;
        height += titleHeight;

        let scalerRect = { x, y, width, height };
        pad.call("TransformView", "setViewportFromFrame", frameModel.id, scalerRect);
    }
}

class FrameResizeModel {
    setEdges(xEdge, yEdge) {
        // xEdge "left" or "right"; yEdge "top" or "bottom".
        // for a side resizer, one or the other will be null;
        this.edges = [ xEdge, yEdge ];
    }
}

class FrameResizeView {
    init() {
        let model = this.getModel();
        if (!model) {return;}

        // ensure main elements have initialised, so the local
        // view's colour is available.
        window.topView.requestInitialization(this, "FrameResizeView", "setup");
        // console.log("FrameResizeView.init");
    }

    setup() {
        this.addEventListener("pointerdown", "pointerDown");

        this.edges = this.model.edges;
        if (this.edges[0] && this.edges[1]) {
            // a corner
            const color = window.topView.querySelector("#scaler").call("PasteUpView", "getUserColor", this.viewId);
            let html = `<div class="resize-corner-blob" style="background-color: ${color}"></div>`;
            this.dom.innerHTML = html;
        }
    }

    getView() {
        // the FrameView
        return this.parentNode;
    }

    getModel() {
        // the FrameModel
        let view = this.getView();
        return view && view.model;
    }

    getEmbeddedObject() {
        // the embedded object, e.g., miniBrowser
        let model = this.getModel();
        let embedInfo = model && model._get("target");
        return embedInfo && model.getElement(embedInfo);
    }

    pointerDown(evt) {
        // console.log("FrameResizeView.pointerDown", evt);
        if (evt.buttons !== 1) {return;}
        evt.preventDefault();
        evt.stopPropagation();

        this.setPointerCapture(evt.pointerId);

        let view = this.getView();
        if (!view) { return; }

        let model = this.getModel();
        if (!model) {return;}
        if (model._get("locked")) {return;}

        // the object within the frame (e.g., miniBrowser)
        let embeddedObject = this.getEmbeddedObject();
        if (!embeddedObject) {return;}

        this.addEventListener("pointermove", "pointerMove");
        this.addEventListener("pointerup", "pointerUp");
        this.addEventListener("pointercancel", "pointerUp");
        this.addEventListener("lostpointercapture", "pointerUp");

        if (!this.scaler) {
            this.scaler = window.topView.querySelector("#scaler");
        }
        if (!this.pad) {
            this.pad = window.topView.querySelector("#pad");
        }

        view.dom.setAttribute("interacting", "true");

        let zoom = this.scaler.currentZoom;
        let translation = this.scaler.currentTranslation;
        let visibleRect = this.pad.dom.getBoundingClientRect();
        let xRaw = clientX => Math.round((translation.x + clientX - visibleRect.x) / zoom);
        let yRaw = clientY => Math.round((translation.y + clientY - visibleRect.y) / zoom);

        // calculate offset from pointer to the affected edge(s),
        // for use during the interaction
        let domRect = view.dom.getBoundingClientRect();
        let [xEdge, yEdge] = this.edges;
        let xOffset = xEdge && xRaw(domRect[xEdge]) - xRaw(evt.clientX);
        let yOffset = yEdge && yRaw(domRect[yEdge]) - yRaw(evt.clientY);
        this.interactionOffset = { x: xOffset, y: yOffset };

        this.resizeTarget = embeddedObject;
        this.frameView = view;

        let updates = {};
        if (xEdge) updates[xEdge] = true;
        if (yEdge) updates[yEdge] = true;

        this.publish(model.id, "requestInteraction", {
            requester: this.viewId,
            data: { updates }
        });
    }

    pointerMove(evt) {
        // console.log("FrameResizeView.pointerMove", evt);
        evt.preventDefault();
        evt.stopPropagation();

        if (!this.resizeTarget) {return;}

        let zoom = this.scaler.currentZoom;
        let translation = this.scaler.currentTranslation;

        // find the drag-point's coordinates on the unscaled scaler
        let visibleRect = this.pad.dom.getBoundingClientRect();
        let dragPointX = Math.round((translation.x + evt.clientX - visibleRect.x) / zoom);
        let dragPointY = Math.round((translation.y + evt.clientY - visibleRect.y) / zoom);

        let frameModel = this.frameView.model;
        let frameInfo = frameModel.asElementRef();
        let resizeTargetInfo = this.resizeTarget.asElementRef();
        let viewId = this.viewId;
        let [ xEdge, yEdge ] = this.edges;
        let interactionOffset = this.interactionOffset;

        let updates = {};
        if (xEdge) updates[xEdge] = dragPointX + interactionOffset.x;
        if (yEdge) updates[yEdge] = dragPointY + interactionOffset.y;

        let publisher = () => this.publish(frameModel.id, "requestInteraction", {
            requester: viewId,
            scope: frameModel.sessionId,
            event: "moveObjectEdges",
            data: {
                target: resizeTargetInfo, viewId, frameInfo,
                updates
            }
        });

        window.topView.throttledInvoke("moveObjectEdges", this.scaler.throttleBaseMS, publisher);
    }

    pointerUp(_evt) {
        // console.log("FrameResizeView.pointerUp", _evt);
        this.releaseAllPointerCapture();
        this.removeEventListener("pointermove", "pointerMove");
        this.removeEventListener("pointerup", "pointerUp");
        this.removeEventListener("pointercancel", "pointerUp");
        this.removeEventListener("lostpointercapture", "pointerUp");

        window.topView.clearThrottledInvoke("moveObjectEdges");

        if (!this.frameView) return;

        this.frameView.dom.setAttribute("interacting", "false");

        let frameModel = this.frameView.model;
        let frameInfo = frameModel.asElementRef();
        let viewId = this.viewId;

        this.publish(frameModel.id, "endInteraction", {
            scope: frameModel.sessionId,
            event: "resizeOrMoveEnd",
            requester: viewId,
            data: { frameInfo, viewId }
        });
    }
}

class FrameMenuModel {
    init() {
        let svg = this.querySelector("#icon");
        if (!svg) {
            let html = `
<svg id="icon-inactive" viewBox="0 0 24 24"><use href="#img-more"></use></svg>
<svg id="icon-active" viewBox="0 0 24 24"><use href="#img-more-active"></use></svg>
`;
            this.innerHTML = html;
        }
        if (!this._get("remoteMenus")) {
            this._set("remoteMenus", {});
        }
        this.subscribe(this.id, "addMenuFor", "addMenuFor");
        this.subscribe(this.id, "removeMenuFor", "removeMenuFor");
        this.subscribe(this.sessionId, "view-exit", "removeMenuFor");
    }

    addMenuFor(viewId) {
        let remoteMenus = {...this._get("remoteMenus")};
        remoteMenus[viewId] = true;
        this._set("remoteMenus", remoteMenus);
        this.publish(this.id, "remoteMenusChanged");
    }

    removeMenuFor(viewId) {
        let remoteMenus = {...this._get("remoteMenus")};
        delete remoteMenus[viewId];
        this._set("remoteMenus", remoteMenus);
        this.publish(this.id, "remoteMenusChanged");
    }
}

class FrameMenuView {
    init() {
        this.addEventListener("click", "click");
        this.subscribe(this.model.id, "remoteMenusChanged", "remoteMenusChanged");
        this.remoteMenusChanged();
        console.log("FrameMenuView.init");
    }

    getMenuTarget() {
        // a reference (string, or object { elementId }) identifying the
        // frame's client model
        let target = this.getTarget();
        return target && target._get("target");
    }

    getTarget() {
        // the FrameModel, target for generic frame-related operations
        let view = this.getView();
        return view && view.model;
    }

    getView() {
        // the FrameView owning this menu
        if (this.parentNode) {
            return this.parentNode.parentNode;
        }
        return null;
    }

    click(_domEvt) {
        let view = this.getView();
        if (!view) {return;}
        let menu = this.makeMenu();
        if (!menu) {return;}
        let cover = window.topView.querySelector("#cover");
        if (!cover) {return;}

        let target = this.getTarget();
        if (!target) {return;}
        view.menuIsActive = true;
        cover.call("CoverView", "addMenu", { menu, placeElement: view });
        this.dom.setAttribute("active", "true");
        this.publish(this.model.id, "addMenuFor", this.viewId);
    }

    remoteMenusChanged() {
        let remoteMenus = this.model._get("remoteMenus");
        let remoteMenuKeys = Object.keys(remoteMenus);

        let target = this.getTarget();

        if (!target.parentNode || remoteMenuKeys.length === 0 || remoteMenus[this.viewId]) {
            this.hideRemoteMenu();
        } else {
            this.showRemoteMenu();
        }
    }

    hideRemoteMenu() {
        if (!this.remoteMenu) {return;}
        this.remoteMenu.remove();
        this.remoteMenu = null;
    }

    showRemoteMenu() {
        if (this.remoteMenu) {return;}
        if (!this.dom.parentNode) {return;}

        let menu = this.makeMenu(true);
        if (!menu) {return;} // if it is already deleted
        this.dom.parentNode.appendChild(menu);
        this.remoteMenu = menu;
    }

    faveIndicator(style) {
        if (!this.svgStarFunc) {
            this.svgStarFunc = new Function(this.model.getLibrary("boards.faveIndicator"))();
        }
        return this.svgStarFunc(style);
    }

    makeMenu(grayedOut) {
        let view = this.getView();
        if (!view) return null;
        let targetInfo = this.getMenuTarget();
        if (!targetInfo) {return null;}
        let menuTarget = this.model.getElement(targetInfo);
        if (!menuTarget) {return null;}

        let target = this.getTarget();
        if (!target) {return null;}

        // if there's a miniBrowser view, ask it for favourites-related menu items.
        let miniBrowserView = view.querySelector("#miniBrowser");
        let faveItems = (miniBrowserView && miniBrowserView.call("MiniBrowserView", "getMenuFavoriteItems")) || [];

        faveItems = faveItems.map((f) => {
            let asset = this.faveIndicator(f.iconGenerator.slice(5));
            return {...f, asset};
        });

        // if this is a ghost for a remote menu, put in blank placeholders for
        // user-specific items (currently only add/remove user favorite).
        // don't bother trying to work out if the remote menu happened to
        // be put up by the same user :)
        if (grayedOut) {
            faveItems = faveItems.map(item => item.localToView ? { label: "--- [user]" } : item);
        }

        let modelItems = menuTarget._get("menuItems") || [];

        let showBorder = target._get("showBorder");
        let locked = target._get("locked");
        let dynamic = [
            { value: showBorder ? "HideBorder" : "ShowBorder",
              label: showBorder ? "Hide border" : "Show border",
              asset: showBorder ? "outline-hide0" : "outline-show0"
            },
            { value: locked ? "UnlockFrame" : "LockFrame",
              label: locked ? "Unlock frame" : "Lock frame",
              asset: locked ? "unlock" : "lock"
            }
        ];

        let items = [
            {value: null, label: "FRAME", asset: null},
            {value: "Delete", label: "Delete", asset: "trash-can"},
            {value: "Copy", label: "Copy", asset: "new"},
            ...faveItems,
            {value: "BringToFront", label: "Bring to front", asset: "bring-front"},
            {value: "SendToBack", label: "Send to back", asset: "send-back"},
            ...dynamic,
            { value: "FullScreen", label: "Full screen", asset: "fullscreen"},
            ...modelItems
        ];

        let customItems = faveItems.concat(modelItems);
        this.customItems = customItems.length ? customItems : null;

        this.menuTarget = menuTarget;
        this.miniBrowserView = miniBrowserView;

        // and a demo feature
        if (window.location.search.indexOf("scripting=true") >= 0) {
            items.push({label: "Scripting"});
        }

        let DOMMenu = this.model.getLibrary("widgets.DOMMenu");
        let holder = document.createElement("div");
        (new DOMMenu()).makeMenu(holder, grayedOut ? "frame-menu-grayed-out" : "frame-menu", items, this, this.menuSelected);

        holder.onDismiss = () => this.menuWasDismissed();

        return holder;
    }

    menuWasDismissed() {
        let view = this.getView();
        if (view) {
            view.menuIsActive = false;
            view.call("FrameView", "pointerLeave");
        }
        this.dom.setAttribute("active", "false");
        this.publish(this.model.id, "removeMenuFor", this.viewId);
    }

    menuSelected(evt) {
        let value = evt.currentTarget.value;

        let cover = window.topView.querySelector("#cover");
        cover.call("CoverView", "menuUp");

        let target = this.getTarget();
        if (!target) {return;}

        if (this.customItems) {
            // having ensured that the target hasn't been deleted
            let more = this.customItems.find((obj) => obj.value === value);
            if (more) {
                this.call(more.traits || "FrameMenuView", more.method, this.menuTarget, this.miniBrowserView);
                return;
            }
        }

        if (value === "Delete") {
            this.trashObject(target);
        }
        if (value === "Copy") {
            this.copyObject(target);
        }
        if (value === "ShowBorder") {
            this.setFrameBorder(target, true);
        }
        if (value === "HideBorder") {
            this.setFrameBorder(target, false);
        }
        if (value === "BringToFront") {
            this.bringToFront(target);
        }
        if (value === "SendToBack") {
            this.sendToBack(target);
        }
        if (value === "LockFrame") {
            this.setLockFrame(target, true);
        }
        if (value === "UnlockFrame") {
            this.setLockFrame(target, false);
        }
        if (value === "FullScreen") {
            this.beFullScreen();
        }
        if (value === "Scripting") {
            this.startScripting(target);
        }
    }

    setFrameBorder(target, flag) {
        let targetInfo = target.asElementRef();
        this.publish(this.sessionId, "setFrameBorder", {target: targetInfo, viewId: this.viewId, flag});
    }

    setLockFrame(target, flag) {
        let targetInfo = target.asElementRef();
        this.publish(this.sessionId, "setLockFrame", {target: targetInfo, viewId: this.viewId, flag});
    }

    trashObject(target) {
        let targetInfo = target.asElementRef();
        this.publish(this.sessionId, "trashObject", {target: targetInfo, viewId: this.viewId});
    }

    copyObject(target) {
        let targetInfo = target.asElementRef();
        this.publish(this.sessionId, "copyObject", {target: targetInfo, viewId: this.viewId});
    }

    bringToFront(target) {
        let targetInfo = target.asElementRef();
        this.publish(this.sessionId, "bringToFront", {target: targetInfo, viewId: this.viewId});
    }

    sendToBack(target) {
        let targetInfo = target.asElementRef();
        this.publish(this.sessionId, "sendToBack", {target: targetInfo, viewId: this.viewId});
    }

    beFullScreen() {
        let tv = window.topView.querySelector("#pad");
        let scaler = window.topView.querySelector("#scaler");
        let view = this.getView();
        let targetInfo = this.getMenuTarget();
        if (!targetInfo) {return;}
        let scalerRect = tv.call("TransformView", "getVisibleScalerRect");

        this.publish(scaler.model.sessionId, "moveAndResizeObject", {
            width: scalerRect.width, height: scalerRect.height,
            x: scalerRect.x, y: scalerRect.y - 28,
            frameInfo: view.model.asElementRef(),
            target: targetInfo
        });
    }

    copyURL(menuTarget) {
        let url = menuTarget.call("MiniBrowser", "getURL");
        if (!url) return;

        if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then((e) => console.log(e), (e) => console.log("error", e));
        }
    }

    openTab(menuTarget) {
        let url = menuTarget.call("MiniBrowser", "getURL");
        if (!url) return;
        window.open(url, "_blank");
    }

    beTransparent(menuTarget) {
        this.publish(menuTarget.id, "beTransparent", true);
    }

    beOpaque(menuTarget) {
        this.publish(menuTarget.id, "beTransparent", false);
    }

    addFavorite(miniBrowserView, faveType) {
        let url = miniBrowserView.call("MiniBrowserView", "getLoadedURL");
        if (!url) return;

        let appInfo = miniBrowserView.call("MiniBrowserView", "getAppInfo");
        let spec = { appInfo, url };
        if (faveType === "session") spec.sessionFave = true;
        else if (faveType === "user") spec.userFave = true;

        let scaler = window.topView.querySelector("#scaler");
        let view = this.getView();
        let rect = view.dom.getBoundingClientRect();
        let pos = { x: rect.right, y: rect.top };
        scaler.call("PasteUpView", "nameAndSetFavorite", pos, faveType, spec);
    }

    removeFavorite(miniBrowserView, faveType) {
        let url = miniBrowserView.call("MiniBrowserView", "getLoadedURL");
        if (!url) return;

        let appInfo = miniBrowserView.call("MiniBrowserView", "getAppInfo");
        let spec = { appName: appInfo.appName, url };
        if (faveType === "session") spec.sessionFave = false;
        else if (faveType === "user") spec.userFave = false;

        let scaler = window.topView.querySelector("#scaler");
        scaler.call("PasteUpView", "setFavorite", spec);
    }

    addUserFavorite(menuTarget, miniBrowserView) {
        this.addFavorite(miniBrowserView, "user");
    }

    removeUserFavorite(menuTarget, miniBrowserView) {
        this.removeFavorite(miniBrowserView, "user");
    }

    addSessionFavorite(menuTarget, miniBrowserView) {
        this.addFavorite(miniBrowserView, "session");
    }

    removeSessionFavorite(menuTarget, miniBrowserView) {
        this.removeFavorite(miniBrowserView, "session");
    }

    startScripting(target) {
        let scaler = window.topView.querySelector("#scaler");

        let objInfo = this.getMenuTarget();
        if (!objInfo) {return;}

        this.publish(scaler.model.id, "startScripting", {
            frameInfo: target.asElementRef(),
            objectInfo: objInfo
        });
    }
}

class FrameLockModel {
    init() {
        this.innerHTML = '<svg id="icon" viewBox="0 0 24 24"><use href="#img-frame-lock"></use></svg>';
    }
}

class FrameLockView {
    init() {
        let model = this.getModel();
        if (!model) {return;}
        this.addEventListener("click", "click");

        this.subscribe(model.id, "frameStateChanged", "frameStateChanged");
        this.frameStateChanged();
    }

    getModel() {
        if (this.parentNode && this.parentNode.parentNode) {
            return this.parentNode.parentNode.model;
        }
        return null;
    }

    click() {
        let model = this.getModel();
        if (!model) {return;}
        let targetInfo = model.asElementRef();
        this.publish(this.sessionId, "setLockFrame", {target: targetInfo, viewId: this.viewId, flag: false});
    }

    frameStateChanged() {
        let model = this.getModel();
        if (!model) {return;}
        let lock = model._get("locked");
        this.dom.setAttribute("locked", "" + lock);
    }
}

class FrameTrashModel {
    init() {
        this.innerHTML = '<svg id="icon" viewBox="0 0 32 28"><use href="#img-close"></use></svg>';
    }
}

class FrameTrashView {
    init() {
        let model = this.getModel();
        if (!model) { return; }
        this.addEventListener("click", "click");
        this.subscribe(this.sessionId, "followingChanged", "followingChanged");
        this.pad = window.topView.querySelector("#pad");

        let presenter = this.pad.model._get("presentingViewId");
        this.followingChanged(presenter);
    }

    getModel() {
        if (this.parentNode && this.parentNode.parentNode) {
            return this.parentNode.parentNode.model;
        }
        return null;
    }

    click() {
        let model = this.getModel();
        if (!model) { return; }
        let presenter = this.pad.model._get("presentingViewId");
        if (presenter && presenter !== this.viewId) {return;}

        let targetInfo = model.asElementRef();
        this.publish(this.sessionId, "trashObject", { target: targetInfo, viewId: this.viewId });
    }

    followingChanged() {
        let presenter = this.pad.model._get("presentingViewId");
        let disabled = presenter && presenter !== this.viewId;
        this.dom.setAttribute("disabled", disabled);
    }
}

class FrameAddressEditModel {
    init() {
        this.innerHTML = '<svg id="icon" viewBox="0 0 24 28"><use href="#img-edit"></use></svg>';
        if (this._get("open") === undefined) {
            this._set("open", false);
        }

        this.subscribe(this.id, "setEditState", "setEditState");
    }

    setEditState(flag) {
        let old = this._set("open");
        if (old !== flag) {
            this._set("open", flag);
            this.publish(this.id, "editStateChanged");
        }
    }
}

class FrameAddressEditView {
    init() {
        let model = this.getModel();
        if (!model) { return; }

        this.addEventListener("click", "click");
        let addressElement = this.getView().querySelector("#externalAddress");
        this.subscribe(addressElement.model.id, "setEditState", "setEditState");
        this.subscribe(addressElement.model.id, "setButtonVisibility", "setButtonVisibility");
        this.subscribe(addressElement.model.id, "text", "addressAccepted");

        this.subscribe(this.model.id, "editStateChanged", "editStateChanged");

        this.editStateChanged();
    }

    getView() {
        return this.parentNode && this.parentNode.parentNode;
    }

    getModel() {
        let view = this.getView();
        return view && view.model;
    }

    click() {
        let model = this.getModel();
        if (!model) { return; }

        let wasEditing = this.getView().dom.classList.contains("editingAddress");
        this.publish(this.model.id, "setEditState", !wasEditing);
    }

    editStateChanged() {
        let flag = this.model._get("open");
        this.setEditState(flag);
    }

    setEditState(bool) {
        let view = this.getView();
        if (view) {
            if (bool) view.dom.classList.add("editingAddress");
            else view.dom.classList.remove("editingAddress");
        }
    }

    addressAccepted({ text }) {
        // just assume that if the accepted text isn't empty it's
        // valid, and hide the field.
        if (!(text.trim())) return;

        this.setEditState(false);
        this.publish(this.model.id, "setEditState", false);
    }

    setButtonVisibility(bool) {
        // allow the edit button itself to be made invisible
        let addressEdit = this.getView().querySelector("#addressEdit");
        if (!addressEdit) return;

        addressEdit.dom.style.setProperty("display", bool ? "" : "none");
    }
}

class RadarModel {
    init() {
        if (this._get("showRadar") === undefined) {
            this._set("showRadar",  false);
        }
        // this.subscribe(this.id, "setShowRadar", "setShowRadar");
    }

    setShowRadar(value) {
        this._set("showRadar", value);
        this.publish(this.id, "showRadarChanged");
    }
}

class RadarView {
    init() {
        // this.subscribe(this.sessionId, "radarUpdate", "render");
        // this.subscribe(this.sessionId, "radarCloseButton", "toggle");
        // this.subscribe(this.sessionId, "followingChanged", "followingChanged");
        // this.subscribe(this.model.id, "showRadarChanged", "showRadarChanged");

        this.pad = window.topView.querySelector("#pad");
        this.scaler = this.pad.querySelector("#scaler");
        this.scalerWidth = parseInt(this.scaler.dom.style.getPropertyValue("width"), 10);
        this.scalerHeight = parseInt(this.scaler.dom.style.getPropertyValue("height"), 10);

        this.addEventListener("pointerdown", "pointerDown");
        this.addEventListener("wheel", "wheel");

        this.hide(false); // start from a known state
        this.showRadarChanged(/* initializing = */ true); // sync with model

        console.log("RadarView.init");
    }

    showRadarChanged(initializing = false) {
        // on initialisation, on starting to follow a presenter,
        // and on publication of a change in the radar show/hide
        // state by a presenter that this view is following,
        // bring our radar into line with the model.
        if (!initializing) {
            let presenterId = this.pad.call("TransformView", "getPresenter");
            if (!presenterId || presenterId === this.viewId || this.pad.following !== presenterId) return;
        }

        let wasShowing = this.dom.getAttribute("extended") === "on";
        let showRadar = this.model._get("showRadar");
        if (showRadar === wasShowing) return;

        if (showRadar) {
            this.show(false);
        } else {
            this.hide(false);
        }
    }

    radarUpdate() {
        // periodic update of radar display while showing
        if (this.dom.getAttribute("extended") === "on") {
            this.future(50).call("RadarView", "radarUpdate");
        }
        this.render();
    }

    show(toPublish) {
        this.dom.setAttribute("extended", "on");
        this.radarUpdate();
        if (toPublish) {
            this.publish(this.model.id, "setShowRadar", true);
        }
    }

    hide(toPublish) {
        this.dom.setAttribute("extended", "off");
        if (toPublish) {
            this.publish(this.model.id, "setShowRadar", false);
        }
    }

    toggle() {
        // let presenterId = this.pad.call("TransformView", "getPresenter");
        let toPublish = false; // presenterId === this.viewId;

        if (this.dom.getAttribute("extended") === "on") {
            this.hide(toPublish);
        } else {
            this.show(toPublish);
        }
    }

    presentationStarted() {
        // if this view is becoming the presenter, share its current
        // radar state to the model and thence to other views.
        // let presenterId = this.pad.call("TransformView", "getPresenter");
        // if (presenterId !== this.viewId) return;

        // let radarOn = this.dom.getAttribute("extended") === "on";
        // this.publish(this.model.id, "setShowRadar", radarOn);
    }

    followingChanged(viewId) {
        // when this view starts (or resumes) following a presenter,
        // make sure the radar show/hide state is in line with the
        // presenter's.
        if (viewId) this.showRadarChanged();
    }

    pointerDown(evt) {
        if (evt.buttons !== 1) {return;}
        evt.preventDefault();
        evt.stopPropagation();
        if (!this.viewport) {return;}

        let padZoom = this.scaler.currentZoom;

        let x = evt.offsetX / this.viewport.scale + this.viewport.offsetX;
        let y = evt.offsetY / this.viewport.scale + this.viewport.offsetY;

        x -= this.viewport.width / 2;
        y -= this.viewport.height / 2;

        x *= padZoom;
        y *= padZoom;

        this.pad.call("TransformView", "jumpViewport", {x, y});
    }

    wheel(evt) {
        evt.preventDefault();
        evt.stopPropagation();

        this.pad.call("TransformView", "wheel", evt);
    }

    ensureCanvas() {
        let canvas = this.dom.querySelector("#canvas");
        if (!canvas) {
            canvas = document.createElement("canvas");
            canvas.id = "canvas";
            canvas.width = 200;
            canvas.height = 200;
            canvas.classList.add("radar-canvas");
            this.dom.appendChild(canvas);
        }
        return canvas;
    }

    computeView(includeViewport, view, canvas, scaler) {
        if (!view) {view = this.pad;}
        if (!scaler) {scaler = this.scaler;}
        if (!canvas) {canvas = this.ensureCanvas();}

        let minL = Number.MAX_VALUE;
        let minT = Number.MAX_VALUE;
        let maxR = Number.MIN_VALUE;
        let maxB = Number.MIN_VALUE;

        let viewRecords = view.model._get("clientViewRecords");
        let children = scaler.dom.childNodes;
        let record;
        let lastViewport;

        if (includeViewport) {
            record = viewRecords[this.viewId];
            if (record && record.lastViewport) {
                let v = record.lastViewport;
                lastViewport = v;
                minL = Math.min(minL, v.x);
                minT = Math.min(minT, v.y);
                maxR = Math.max(maxR, v.x + v.width);
                maxB = Math.max(maxB, v.y + v.height);
            } else {
                return null;
            }
        }

        children.forEach((c) => {
            if (!c.key) {return;}
            let cView = window.views[c.key];
            let r = cView.call("FrameView", "getRect");
            if (!r) {return;}

            minL = Math.min(minL, r.x);
            minT = Math.min(minT, r.y);
            maxR = Math.max(maxR, r.x + r.width);
            maxB = Math.max(maxB, r.y + r.height);
        });

        let mx = maxR - minL;
        let my = maxB - minT;

        let max = Math.max(mx, my);

        let extra = Math.max(1.2, Math.min(2, this.scalerWidth / max));

        let scale = canvas.width / (Math.max(mx, my) * extra);
        let offsetX;
        let offsetY;

        let centerX = (maxR + minL) / 2;
        let centerY = (maxB + minT) / 2;

        if (mx > my) {
            offsetX = (maxR + minL) / extra - (maxR - minL);
            offsetY = (maxB + minT) / extra - ((maxB - minT) + (mx - my));
        } else {
            offsetX = (maxR + minL) / extra - ((maxR - minL) + (my - mx));
            offsetY = (maxB + minT) / extra - (maxB - minT);
        }

        return {scale, offsetX, offsetY, lastViewport, centerX, centerY};
    }

    render(force) {
        if (!force && this.dom.getAttribute("extended") === "off") {return;}

        let view = this.pad;
        let scaler = this.scaler;
        let children = scaler.dom.childNodes;
        let canvas = this.ensureCanvas();
        let ctx = canvas.getContext('2d');
        ctx.lineWidth = 1;

        let viewport = this.computeView(true, view, {width: canvas.width}, scaler);
        if (!viewport) {return;}
        this.viewport = viewport;

        let {lastViewport, scale, offsetX, offsetY} = viewport;

        // clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // fill canvas with shadow, and clear all viewports
        ctx.fillStyle = "#C0C0C0C0";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#FFFFFFC0";

        let args = [
            (lastViewport.x - offsetX) * scale, (lastViewport.y - offsetY) * scale,
            lastViewport.width * scale, lastViewport.height * scale
        ];
        ctx.clearRect(...args);
        ctx.fillRect(...args);

        args = [
            (0 - offsetX) * scale, (0 - offsetY) * scale,
            this.scalerWidth * scale, this.scalerHeight * scale];
        ctx.strokeStyle = "#4D4D4D";
        ctx.strokeRect(...args);

        // outline all viewports
        ctx.lineWidth = 1;
        ctx.strokeStyle = this.randomColor(this.viewId, 0.8);
        args = [
            (lastViewport.x - offsetX) * scale, (lastViewport.y - offsetY) * scale,
            lastViewport.width * scale, lastViewport.height * scale];
        ctx.strokeRect(...args);

        // outline all views
        ctx.fillStyle = "#78acad40";
        ctx.strokeStyle = "#78acad";
        ctx.lineWidth = 1;
        children.forEach((c) => {
            if (!c.key) {return;}
            let cView = window.views[c.key];
            let rect = cView.call("FrameView", "getRect");
            if (!rect) {return;}
            args = [
                (rect.x - offsetX) * scale, (rect.y - offsetY) * scale,
                rect.width * scale, rect.height * scale];
            ctx.fillRect(...args);
            ctx.strokeRect(...args);
            args[3] = 1;
            ctx.strokeRect(...args);
        });
    }

    randomColor(viewId, opacity) {
        let h = Math.floor(parseInt(viewId, 36) / (36 ** 10) * 360);
        let s = "40%";
        let l = "40%";
        return `hsla(${h}, ${s}, ${l}, ${opacity})`;
    }
}

class RadarButtonView {
    init() {
        this.addEventListener("click", "click");
        console.log("RadarButtonView.init");
        this.radarView = window.topView.querySelector("#radar");
    }

    click() {
        this.radarView.call("RadarView", "toggle");
    }
}

class VersionStringView {
    init() {
        // this.getVersion();
    }

    version(string) {
        this.dom.textContent = string;
        this.dom.style.setProperty("font-family", "Poppins-Medium");
        this.dom.style.setProperty("font-size", "10px");
        this.dom.style.setProperty("margin-left", "auto");
        this.dom.style.setProperty("margin-right", "20px");
    }

    getVersion() {
        let url = "./meta/version.txt";
        fetch(url, {
            method: "GET",
            mode: "cors",
            headers: { "Content-Type": "text" }
        })
            .then((r) => {
                return r.ok ? r.text() : "";
            })
            .then((t) => {
                if (t) {
                    this.version(t);
                } else {
                    console.log("version file not found");
                }
            })
            .catch((e) => {
                console.error(e.message, e);
            });
    }
}

class VSeparatorModel {
    init() {
        this.innerHTML = '<div id="vSeparator-feedback"></div>';
    }
}

class VSeparatorView {
    init() {
        this.addEventListener('pointerdown', "pointerDown");
        this.addEventListener('pointerenter', "show");
        this.addEventListener('pointerleave', "hide");
        this.feedback = this.dom.querySelector("#vSeparator-feedback");

        if (!window.fromLandingPage ||
            window.fromLandingPage.chat === "videoOnly" ||
            window.fromLandingPage.chat === "textOnly" ||
            window.fromLandingPage.chat === "off") {
            this.dom.style.setProperty("display", "none");
        }

        this.separatorHeight = 4;
        this.hide();
        console.log("VSeparatorView.init");
    }

    show(_evt) {
        this.feedback.setAttribute("hovered", "true");
    }

    hide(_evt) {
        this.feedback.setAttribute("hovered", "false");
    }

    pointerDown(evt) {
        if (evt.buttons !== 1) {return;}
        let niichan = this.dom.previousElementSibling;
        if (!niichan) {return;}
        let otouto = this.dom.nextElementSibling;
        if (!otouto) {return;}

        this.setPointerCapture(evt.pointerId);

        if (!this.scaler) {
            this.scaler = window.topView.querySelector("#scaler");
        }

        this.downPoint = {x: evt.clientX, y: evt.clientY};
        let oldValue = niichan.style.getPropertyValue("height");
        if (oldValue === "auto" || oldValue.endsWith("%")) {
            oldValue = niichan.getBoundingClientRect().height;
            niichan.style.setProperty("height", oldValue + "px");
        } else {
            oldValue = parseFloat(oldValue);
        }
        this.oldHeight = oldValue;

        this.addEventListener("pointermove", "pointerMove");
        this.addEventListener("pointerup", "pointerUp");
        this.addEventListener("pointercancel", "pointerUp");
        this.addEventListener("lostpointercapture", "pointerUp");
    }

    pointerMove(evt) {
        evt.preventDefault();
        evt.stopPropagation(); // e.g., to suppress reports of board-area pointer moves
        if (this.downPoint) {
            let cooked = this.cookEvent(evt);

            let niichan = this.dom.previousElementSibling;

            let diff = cooked.clientY - this.downPoint.y;
            let newHeight = this.oldHeight + diff;
            // this view separates two elements vertically, (or horizontally?)
            let wHeight = this.dom.parentNode.clientHeight;
            newHeight = Math.max(newHeight, this.separatorHeight + 200);
            newHeight = Math.min(newHeight, wHeight - 200);

            niichan.style.setProperty("height", newHeight + "px");

            let videoChatFrame = niichan.querySelector("#videoChatFrame");
            if (videoChatFrame) {
                videoChatFrame.style.setProperty("height", newHeight + "px");
            }

        }
    }

    pointerUp() {
        this.releaseAllPointerCapture();
        this.downPoint = null;
        this.removeEventListener("pointermove", "pointerMove");
        this.removeEventListener("pointerup", "pointerUp");
        this.removeEventListener("pointercancel", "pointerUp");
        this.removeEventListener("lostpointercapture", "pointerUp");
    }
}

class SeparatorModel {
    init() {
        this.innerHTML = '<div id="separator-feedback"></div>';
    }
}

class SeparatorView {
    init() {
        this.addEventListener('pointerdown', "pointerDown");
        this.addEventListener('pointerenter', "show");
        this.addEventListener('pointerleave', "hide");
        this.feedback = this.dom.querySelector("#separator-feedback");
        this.separatorWidth = 4;
        this.hide();
        console.log("SeparatorView.init");
    }

    show(_evt) {
        this.feedback.setAttribute("hovered", "true");
    }

    hide(_evt) {
        this.feedback.setAttribute("hovered", "false");
    }

    pointerDown(evt) {
        if (evt.buttons !== 1) {return;}
        let parent = this.parentNode;
        if (!parent) {return;}

        this.setPointerCapture(evt.pointerId);

        if (!this.scaler) {
            this.scaler = window.topView.querySelector("#scaler");
        }

        parent = parent.dom;
        this.downPoint = {x: evt.clientX, y: evt.clientY};
        let oldValue = parent.style.getPropertyValue("width");
        if (oldValue === "auto") {
            oldValue = parent.getBoundingClientRect().width;
            parent.style.setProperty("width", "100px");
        } else {
            oldValue = parseFloat(oldValue);
        }
        this.oldWidth = oldValue;

        this.addEventListener("pointermove", "pointerMove");
        this.addEventListener("pointerup", "pointerUp");
        this.addEventListener("pointercancel", "pointerUp");
        this.addEventListener("lostpointercapture", "pointerUp");
    }

    pointerMove(evt) {
        evt.preventDefault();
        evt.stopPropagation(); // e.g., to suppress reports of board-area pointer moves
        if (this.downPoint) {
            let cooked = this.cookEvent(evt);
            let parent = this.parentNode;
            if (!parent) {return;}
            parent = parent.dom;
            let diff = cooked.clientX - this.downPoint.x;
            let newWidth = this.oldWidth - diff;
            // because right now it is used for the thing on the right edge.
            newWidth = Math.max(newWidth, this.separatorWidth);

            let pad = window.topView.dom.querySelector("#pad");
            let padRect = pad.getBoundingClientRect();
            let space = padRect.width - 100;
            newWidth = Math.min(newWidth, space);
            parent.style.setProperty("width", newWidth + "px");

            window.topView.throttledInvoke("publishSeparatorMove", this.scaler.throttleBaseMS * 3, () => {
                let tv = window.topView.querySelector("#pad");
                tv.call("TransformView", "adjustToFollowedViewport");
                tv.call("TransformView", "publishViewport");
                tv.call("TransformView", "adjustHeaderPosition");
            });
        }
    }

    pointerUp() {
        this.releaseAllPointerCapture();
        this.downPoint = null;
        this.removeEventListener("pointermove", "pointerMove");
        this.removeEventListener("pointerup", "pointerUp");
        this.removeEventListener("pointercancel", "pointerUp");
        this.removeEventListener("lostpointercapture", "pointerUp");
    }
}

class ScaleReadOutModel {
    init() {
        if (!this.querySelector("#readout")) {
            let readout = this.createElement();
            readout.domId = "readout";
            readout.innerHTML = "100%";
            this.appendChild(readout);
        }
    }
}

class ScaleReadOutView {
    init() {
        this.readout = this.querySelector("#readout");
        this.addEventListener("click", "setScale");
    }

    showScale(number) {
        this.readout.dom.innerHTML = (number * 100).toFixed(0) + "%";
    }

    setScale() {
        let pad = window.topView.querySelector("#pad");
        if (pad) {
            pad.call("TransformView", "zoomAboutPoint", 1);
        }
    }
}

class PresentationButtonModel {
    init() {
        if (!this.querySelector("#button")) {
            let button = this.createElement();
            button.domId = "button";
            this.innerHTML = `
                <svg viewBox="0 0 24 24" class="unhovered">
                   <use href="#img-roomnavigation-presenation2"></use></svg>`;
            this.appendChild(button);
        }
    }
}

class PresentationButtonView {
    init() {
        this.showingMenu = false;
        this.addEventListener("click", "click");
        this.dom.title = "Presentation";
    }

    click() {
        if (this.showingMenu) {
            this.removeMenu();
        } else {
            this.startMenu();
        }
    }

    startMenu() {
        let cover = window.topView.querySelector("#cover");
        if (!cover) { return; }

        this.showingMenu = true;
        let menu = this.makeMenu();
        cover.call("CoverView", "addMenu", { menu, placeElement: this, position: "present" });
    }

    removeMenu() {
        if (!this.showingMenu) return;

        let cover = window.topView.querySelector("#cover");
        if (cover) cover.call("CoverView", "menuUp");
    }

    makeMenu() {
        // menu option for presenting:
        //   no-one presenting => "Start Presenting"
        //   this client presenting => "Stop Presenting"
        //   following other client presenting => "Leave Presentation"
        //   not following other client => "Join Presentation"
        let items = [{
            value: null, label: "PRESENTATION", asset: null
        }];

        let pad = window.topView.querySelector("#pad");
        let thisId = pad.viewId;

        let presenterId = pad.call("TransformView", "getPresenter");
        if (!presenterId) {
            items.push({ value: "startPresenting", label: "Start Presenting" });
        } else if (presenterId === thisId) {
            items.push({ value: "stopPresenting", label: "Stop Presenting" });
        } else if (pad.following) {
            items.push({ value: "leavePresentation", label: "Leave Presentation" });
            items.push({ value: "forceStopPresentation", label: "Force Stop Presentation" });
        } else {
            items.push({ value: "joinPresentation", label: "Join Presentation" });
        }

        if (typeof window.backdropURL === "string") {
            items.push({value: "setBackground", label: "Set desktop background"});
        }

        // a demo feature
        /* nov 2020: disallow on Presentation menu
        if (window.location.search.indexOf("scripting=true") >= 0) {
            items.push({ value: "openWorkspace", label: "Workspace" });
        }
        */

        let DOMMenu = pad.model.getLibrary("widgets.DOMMenu"); // any model will do
        let holder = document.createElement("div");
        holder.className = "presentMenu";
        (new DOMMenu()).makeMenu(holder, "presentation-menu", items, this, this.menuSelected);
        holder.onDismiss = () => this.showingMenu = false;

        return holder;
    }

    menuSelected(evt) {
        let value = evt.currentTarget.value;

        this.removeMenu();

        let pad = window.topView.querySelector("#pad");
        let thisId = pad.viewId;

        // the menu items are based on the state at the time the menu was called up.
        // by the time a selection is made, the available options could be different.
        // in the case of a global change (start or stop presenting to all), the
        // model must decide if the change can go ahead.
        // a local change (leaving or joining another view's presentation) is
        // handled by local TransformView methods.
        if (value === "startPresenting") {
            console.log(`request to start presentation as ${thisId}`);
            this.publish(pad.model.id, "startPresentation", thisId); // to model
        } else if (value === "stopPresenting") {
            console.log(`request to stop presentation as ${thisId}`);
            this.publish(pad.model.id, "stopPresentation", thisId); // to model
        } else if (value === "forceStopPresentation") {
            console.log(`request to force stop presentation as ${thisId}`);
            this.publish(pad.model.id, "forceStopPresentation", thisId); // to model
        } else if (value === "leavePresentation") {
            pad.call("TransformView", "leavePresentation", /* tellModel = */ true);
        } else if (value === "joinPresentation") {
            pad.call("TransformView", "joinPresentation", /* tellModel = */ true);
        } else if (value === "openWorkspace") {
            let scaler = window.topView.querySelector("#scaler");
            let t = scaler.currentTranslation;
            this.publish(this.sessionId, "openWorkspace", t);
        } else if (value === "setBackground") {
            this.publish(this.sessionId, "setBackground", {url: window.backdropURL, type: "iframe"});
        }
    }
}

class AnnotationButtonModel {
    init() {
        this._set("defaultColor", "#A6A8A9");
        this.style.setProperty("fill", this._get("defaultColor"));
    }

    svg() {
        let Cls = this.getLibrary("boards.MarkerPenIcon");
        let maker = new Cls();
        return maker.marker();
    }
}

class AnnotationButtonView {
    init() {
        this.active = false;
    }

    setActive(flag, color) {
        if (flag === this.active) {return;}
        this.active = flag;

        this.dom.style.setProperty("fill", flag ? color : this.model._get("defaultColor"));
    }
}

class RoomNameModel {
    init() {
        this.classList.add("room-name-readout");
        this.innerHTML = "(Unknown)";
    }
}

class RoomNameView {
    setName(name) {
        this.dom.textContent = name;
    }
}

class RoomParticipantsModel {
    init() {
        if (!this._get("init")) {
            this._set("init", true);
            this.classList.add("room-participants-holder");
            let icon = this.createElement();
            icon.classList.add("room-participants-icon");

            icon.innerHTML = `<svg viewBox="0 0 24 24" class="icon-svg"><use href="#img-numberofoccupants"></use></svg>`;
            let number = this.createElement();
            number.classList.add("room-participants-number");
            number.domId = "participants-number";
            number.innerHTML = "0";

            let tooltip = this.createElement("div");
            tooltip.classList.add("room-participants-tooltip");
            tooltip.domId = "participants-tooltip";

            let tooltipArrow = this.createElement("div");
            tooltipArrow.classList.add("room-participants-tooltip-arrow");

            let tooltipContents = this.createElement("div");
            tooltipContents.classList.add("room-participants-tooltip-contents");
            tooltipContents.domId = "participants-contents";

            tooltip.appendChild(tooltipArrow);
            tooltip.appendChild(tooltipContents);

            this.appendChild(number);
            this.appendChild(icon);
            this.appendChild(tooltip);
        }
    }
}

class RoomParticipantsView {
    init() {
        this.tooltip = this.querySelector("#participants-tooltip");
        this.count = this.querySelector("#participants-number");
        this.contents = this.querySelector("#participants-contents");
    }

    setScaler(view) {
        this.scaler = view;
        this.subscribe(this.scaler.model.id, "userInfoChanged", "updateCount");
    }

    setCount(number) {
        this.count.dom.innerHTML = `${number}`;
        this.dom.setAttribute("number", `${number}`);

        if (number > 0) {
            this.tooltip.dom.style.removeProperty("visibility");
        } else {
            this.tooltip.dom.style.setProperty("visibility", "none");
        }
    }

    setNames(names) {
        this.contents.dom.innerHTML = names.join("<br>");
    }

    updateCount() {
        let userInfo = this.scaler && this.scaler.model._get("userInfo") || {};
        let keys = Object.keys(userInfo);
        let count = keys.length;
        let names = keys.map(k => userInfo[k].nickname);
        this.setCount(count);
        this.setNames(names);
    }
}

export const supplemental = {TitleView, MiddleView, PeerView, FrameModel, FrameView, FrameMoveView, FrameResizeModel, FrameResizeView, FrameMenuModel, FrameMenuView, FrameLockModel, FrameLockView, FrameTrashModel, FrameTrashView, FrameAddressEditModel, FrameAddressEditView, RadarModel, RadarView, RadarButtonView, VersionStringView, VSeparatorModel, VSeparatorView, SeparatorModel, SeparatorView, ScaleReadOutModel, ScaleReadOutView, PresentationButtonModel, PresentationButtonView, AnnotationButtonModel, AnnotationButtonView, RoomNameModel, RoomNameView, RoomParticipantsModel, RoomParticipantsView};
