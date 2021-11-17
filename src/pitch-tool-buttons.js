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

export class AppButton {
    constructor(managerView, appInfo) {
        this.managerView = managerView;

        let { label, iconName, urlTemplate, pressHold, viewBox } = this.appInfo = appInfo;
        this.urlTemplate = urlTemplate;

        this.dom = document.createElement("div");
        this.dom.classList.add("tool-button");
        managerView.setIconAndLabel(this.dom, iconName, label, viewBox);

        // this.holder = this.dom.querySelector(".tool-button-holder");

        this.noPressHold = !pressHold;

        if (pressHold) {
            this.containerDom = document.createElement("div");
            this.containerDom.classList.add("tool-button-secondary-container");
            this.containerDom.appendChild(this.dom);

            this.triangle = document.createElement("div");
            this.triangle.classList.add("tool-button-triangle");
            this.containerDom.appendChild(this.triangle);
        }

        this.pressHoldDuration = 400;
        this.startTime = Number.MAX_VALUE;
        this.pressHoldEvent = new CustomEvent("pressHold");
        this.pointerEnterHandler = (evt) => this.pointerEnter(evt);
        this.pressingDownHandler = (evt) => this.pressingDown(evt);
        this.pointerUpHandler = (evt) => this.pointerUp(evt);
        this.notPressingDownHandler = (evt) => this.notPressingDown(evt);
        this.pressHoldHandler = (evt) => this.pressHold(evt);

        this.dom.addEventListener("pointerenter", this.pointerEnterHandler, false);
        this.dom.addEventListener("pointerdown", this.pressingDownHandler, false);
        this.dom.addEventListener("pointerup", this.pointerUpHandler, false);
        this.dom.addEventListener("pointerleave", this.notPressingDownHandler, false);
        this.dom.addEventListener("pressHold", this.pressHoldHandler, false);

        this.toolSelectionState = null;
        this.favoritesMenu = null;
        this.isShowingSecondary = false;
    }

    setSecondaryButton(appName, button) {
        button.isSecondaryButton = true;
        button.appName = appName;
        this.secondaryButton = button;
        this.triangle.style.removeProperty("display");
    }

    getName() {
        return this.appInfo.appName;
    }

    pointerEnter(_evt) {
        // the pointer entering the button does nothing to change
        // tool-selection state unless the tool list already has
        // an active menu (for a button other than this).
        // for now, if showingMenu state isn't true - i.e., it
        // might be "dummy", meaning that some app started showing
        // its secondary button(s) - we don't attempt to take over
        // the state.
        if (!this.toolSelectionState) return;

        let { name, showingMenu } = this.toolSelectionState;
        if (showingMenu !== true || name === this.getName()) return;

        this.startFavoritesMenu();
    }

    pressingDown(evt) {
        if (this.noPressHold) return;

        if (evt.buttons !== 1) return;

        let state = this.toolSelectionState;
        let noAnimate = (state && state.name === this.getName() && state.showingMenu) || this.isShowingSecondary;

        // this.setPointerCapture(evt.pointerId);
        requestAnimationFrame(() => this.timer());
        this.startTime = noAnimate ? Number.MAX_VALUE : Date.now();
        evt.preventDefault();
        this.held = false;
        let rect = this.dom.getBoundingClientRect();
        this.pressingPosition = { x: rect.right + 10, y: rect.top + 10 };
    }

    notPressingDown(_evt) {
        if (this.noPressHold) return;

        cancelAnimationFrame(this.timerID);
        this.startTime = Number.MAX_VALUE;
        let tools = window.topView.querySelector("#tools");
        tools.call("ToolsView", "circle", 0);
        // this.releaseAllPointerCapture();
    }

    pointerUp(evt) {
        this.notPressingDown(evt);
        if (!this.held) this.click();
    }

    timer() {
        let now = Date.now();
        let tools = window.topView.querySelector("#tools");
        if ((now - this.startTime) < this.pressHoldDuration) {
            this.timerID = requestAnimationFrame(() => this.timer());
            if ((now - this.startTime) < (this.pressHoldDuration * 0.3)) { return; }
            let rad = ((now - this.startTime) / this.pressHoldDuration) * 2 * Math.PI;
            tools.call("ToolsView", "circle", rad, this.pressingPosition.x, this.pressingPosition.y);
        } else {
            this.held = true;
            this.dom.dispatchEvent(this.pressHoldEvent);
            tools.call("ToolsView", "circle", 0);
            // this.releaseAllPointerCapture();
        }
    }

    click() {
        this.publishPress({appInfo: this.appInfo});
    }

    pressHold() {
        //this.startFavoritesMenu();
        this.showSecondary();
    }

    publishPress(options = {}) {
        // publish the button rect (which covers the extended button
        // region, including the label)
        let buttonClientRect = this.dom.getBoundingClientRect();
        this.managerView.publishToAll({ name: this.getName(), buttonClientRect, ...options });
    }

    updatedToolState(state) {
        // event from TransformView announcing new tool state.
        // state is { name, showingMenu, selected } or null.
        // "name" is the name of the last tool button that the user
        // interacted with; it is only selected (i.e., ready to
        // instantiate a frame) if "selected" is true.
        // in addition to false and true, showingMenu can be "dummy",
        // meaning that the named button's secondary button has just
        // been displayed.
        let referencedTool = state && state.name;
        let thisName = this.getName();

        if (referencedTool === thisName && state.selected) {
            this.dom.classList.add("app-selected");
        } else {
            this.dom.classList.remove("app-selected");
            // if this button has a secondary, and state is either null
            // or indicates selection of a tool that isn't here or the
            // secondary, ensure the secondary is hidden.
            let secondaryName = this.secondaryButton && this.secondaryButton.appName; // if any
            if (secondaryName &&
                (!referencedTool ||
                    (state.selected && referencedTool !== thisName && referencedTool !== secondaryName)
                )) {
                this.hideSecondary();
            }
        }

        this.toolSelectionState = state;
    }

    dropHighlightedTool(appName) {
        // event from TransformView announcing tool highlight.
        // appName is null when no button should be selected
        let selected = this.getName() === appName;
        if (selected) {
            this.dom.classList.add("tool-button-drophighlight");
        } else {
            this.dom.classList.remove("tool-button-drophighlight");
        }
    }

    toolFavoritesChanged(appName) {
        // event from TransformView announcing a change that might affect
        // this tool's favourites list.  appName is null if this is in
        // response to an update in user wallet.
        // only needs to be acted on if this tool's favourites menu is up,
        // and not being edited.
        if ((appName && this.getName() !== appName) || !this.favoritesMenu) return;

        if (this.isMenuBeingEdited()) return; // ignore.  we'll catch it after the edit.

        this.startFavoritesMenu();
    }

    startFavoritesMenu() {
        let menuHolder = this.makeMenu();
        let rect = this.dom.getBoundingClientRect();
        menuHolder.style.setProperty("position", "absolute");
        menuHolder.style.setProperty("left", (rect.right + 10) + "px");
        menuHolder.style.setProperty("top", (rect.top) + "px");
        this.publishPress({ menu: menuHolder });
    }

    showSecondary() {
        let secondary = this.secondaryButton.dom;
        secondary.style.setProperty("margin-left", "3px");
        this.dom.parentNode.appendChild(secondary);
        let dummyMenu = { dummy: true }; // the TransformView and CoverView know how to deal with this
        this.triangle.style.setProperty("display", "none");
        this.isShowingSecondary = true;
        this.publishPress({ menu: dummyMenu });
    }

    hideSecondary() {
        if (!this.isShowingSecondary) return;

        this.isShowingSecondary = false;
        let secondary = this.secondaryButton.dom;
        secondary.parentNode.removeChild(secondary);
        this.triangle.style.removeProperty("display");
    }

    makeMenuItem(value, options) {
        let nameDiv = document.createElement("div");
        let { label } = options;
        if (value === null) {
            nameDiv.classList.add("no-select", "fave-menu-title");
            nameDiv.innerHTML = `<span>${label}</span>`;
            // the title line must always swallow pointerdown
            nameDiv.addEventListener("pointerdown", evt => evt.preventDefault(), true);
            return nameDiv;
        }

        nameDiv.classList.add("no-select", "fave-menu-item");
        nameDiv.innerHTML = `<span class="fave-menu-label">${label}</span>`;
        let nameSpan = nameDiv.firstChild;
        nameDiv.q_pointerup = _evt => this.menuSelected(value);
        nameDiv.addEventListener("pointerup", nameDiv.q_pointerup, true);

        // a label with a potentially editable child span needs to swallow
        // pointerdown only when the span isn't being edited.
        // (note that simply cancelling the event in bubbling phase is
        // evidently still too intrusive; the inner span never responds
        // to the pointerdown)
        nameDiv.addEventListener("pointerdown", evt => nameSpan.getAttribute("contentEditable") !== "true" && evt.preventDefault(), true);

        let wrapper = document.createElement("div");
        wrapper.classList.add("no-select", "fave-menu-item-wrapper");
        wrapper.appendChild(nameDiv);

        let editIconDiv = document.createElement("div");
        editIconDiv.classList.add("no-select", "fave-menu-icon-holder");
        editIconDiv.innerHTML = `<div class="fave-menu-icon"><svg viewBox="0 0 24 24" class="fave-menu-icon-svg"><use href="#img-edit"></use></svg></div>`;
        editIconDiv.addEventListener("pointerdown", evt => evt.preventDefault(), true);
        editIconDiv.addEventListener("pointerup", _evt => this.menuEdit(nameSpan, value, options.sessionFave, options.userFave), true);
        wrapper.appendChild(editIconDiv);

        let sessionFaveDiv = document.createElement("div");
        sessionFaveDiv.classList.add("no-select", "fave-menu-icon-holder");
        let svg = this.managerView.svgStarFunc(options.sessionFave ? "session" : null);
        sessionFaveDiv.innerHTML = `<div class="fave-menu-icon">${svg}</div>`;
        sessionFaveDiv.addEventListener("pointerdown", evt => evt.preventDefault(), true);
        sessionFaveDiv.addEventListener("pointerup", _evt => this.menuSetFave(nameSpan, value, "session", !options.sessionFave), true);
        wrapper.appendChild(sessionFaveDiv);

        let userFaveDiv = document.createElement("div");
        userFaveDiv.classList.add("no-select", "fave-menu-icon-holder");
        svg = this.managerView.svgStarFunc(options.userFave ? "user" : null);
        userFaveDiv.innerHTML = `<div class="fave-menu-icon">${svg}</div>`;
        userFaveDiv.addEventListener("pointerdown", evt => evt.preventDefault(), true);
        userFaveDiv.addEventListener("pointerup", _evt => this.menuSetFave(nameSpan, value, "user", !options.userFave), true);
        wrapper.appendChild(userFaveDiv);

        return wrapper;
    }

    makeMenu() {
        let menu = document.createElement("div");
        menu.classList.add("fave-menu", "no-select");
        let name = this.getName();
        let title = this.makeMenuItem(null, { label: name.toUpperCase() });
        menu.appendChild(title);

        let scaler = window.topView.querySelector("#scaler");
        let faves = scaler.call("PasteUpView", "getAppFavorites", name); // objects { url, userName, sessionName }
        let labeledFaves = faves.map(spec => {
            let { userName, sessionName } = spec;
            let label = (sessionName && userName && sessionName !== userName) ? `${sessionName} | ${userName}` : (sessionName || userName);
            let sortLabel = sessionName || userName;
            return { label, sortLabel, ...spec };
        });

        // if two items have same label, one must be a session favourite
        // and the other user-specific.  put the session fave first.
        labeledFaves.sort((a, b) => {
            return (
                a.sortLabel < b.sortLabel ? -1 :
                    a.sortLabel > b.sortLabel ? 1 :
                    a.sessionName ? -1 : 1);
        });

        labeledFaves.forEach(spec => {
            let { label, url, userName, sessionName } = spec;
            let opt = this.makeMenuItem(url, { label, sessionFave: !!sessionName, userFave: !!userName });
            menu.appendChild(opt);
        });

        let menuHolder = document.createElement("div");
        menuHolder.classList.add("fave-menu-holder");
        menuHolder.setAttribute("editInProgress", "false");
        menuHolder.style.opacity = 1;
        menuHolder.appendChild(menu);
        // when dismissed, only reset the favoritesMenu
        // if it was still pointing to this menu.
        menuHolder.onDismiss = () => { if (this.favoritesMenu === menuHolder) this.favoritesMenu = null; };
        this.favoritesMenu = menuHolder;
        return menuHolder;
    }

    isMenuBeingEdited() {
        let menuElem = this.favoritesMenu;
        if (!menuElem) return false;

        return menuElem.getAttribute("editInProgress") === "true";
    }

    menuSelected(value) {
        // a click on a menu label div
        if (this.isMenuBeingEdited()) return;

        this.publishPress({ url: value });
    }

    menuEdit(nameElem, value, sessionFave, userFave) {
        // a click on an edit icon
        let menuElem = this.favoritesMenu;
        if (!menuElem || this.isMenuBeingEdited()) return;

        menuElem.setAttribute("editInProgress", "true");

        nameElem.setAttribute("contenteditable", "true");
        nameElem.q_originalText = nameElem.textContent;
        nameElem.q_editKeyDown = e => this.editKeyDown(nameElem, e);
        nameElem.q_editFocusLost = _e => this.editFocusLost(nameElem, value, sessionFave, userFave);
        nameElem.addEventListener("keydown", nameElem.q_editKeyDown, true);
        nameElem.addEventListener("blur", nameElem.q_editFocusLost, true);

        // https://stackoverflow.com/questions/36284973/set-cursor-at-the-end-of-content-editable
        let range = document.createRange();
        range.selectNodeContents(nameElem);
        range.collapse(false);
        let selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);

        nameElem.focus();
    }

    editKeyDown(nameElem, evt) {
        if (evt.code === "Enter") {
            evt.preventDefault();
            nameElem.q_userAction = "accept";
            nameElem.blur();
        } else if (evt.code === "Escape") {
            evt.preventDefault();
            nameElem.q_userAction = "cancel";
            nameElem.blur();
        }
    }

    parseFaveText(text) {
        // parse the text in a favourites-menu entry.
        // if there is a bar, split the text and take the first entry
        // as the session name and the second entry as the user name.
        // if no bar, use the entire string as both session and user name.
        let names = text.split("|").map(name => name.trim());
        let sessionName = names[0];
        let userName = names.length > 1 ? names[1] : sessionName;
        return [sessionName, userName];
    }

    editFocusLost(nameElem, value, sessionFave, userFave) {
        let menuElem = this.favoritesMenu; // might have already been ditched
        if (!menuElem) return;

        menuElem.setAttribute("editInProgress", "false");

        nameElem.removeAttribute("contenteditable");
        nameElem.removeEventListener("keydown", nameElem.q_editKeyDown, true);
        nameElem.removeEventListener("blur", nameElem.q_editFocusLost, true);
        let originalText = nameElem.q_originalText;
        delete nameElem.q_originalText;
        let userAction = nameElem.q_userAction; // if any
        delete nameElem.q_userAction;
        let newText = nameElem.textContent.trim();

        let [origSession, origUser] = this.parseFaveText(originalText);
        let [newSession, newUser] = this.parseFaveText(newText);

        // if the focus was lost other than because the user hit enter,
        // or if the edited names are empty or unchanged, don't propagate.
        if (userAction !== "accept" || !newSession || !newUser || (newSession === origSession && newUser === origUser)) {
            nameElem.textContent = originalText; // whatever happens, restore.

            // if the menu is going to stay up (because the edit ended with
            // an explicit accept or cancel), always refresh.  this ensures
            // that the cover object is restored to the right menu-showing
            // state.
            if (userAction) this.startFavoritesMenu();
            return;
        }

        let appInfo = this.appInfo;
        let url = value;
        let spec = { appInfo, url };
        // this method is called with sessionFave and userFave statuses
        // indicating which name(s) are being edited.
        // in general, we treat the edit as applying to the state(s) from
        // when the method was invoked (even though other users might have
        // changed the favourite while the edit was happening).
        // in the particular case where the user has accepted a text with a
        // bar (indicating both session and user names), we make sure that
        // both sessionFave and userFave are set to true.
        let supplySession = sessionFave || newSession !== newUser;
        let supplyUser = userFave || newSession !== newUser;
        if (supplySession) {
            spec.proposedSessionName = newSession;
            spec.sessionFave = true;
        }
        if (supplyUser) {
            spec.proposedUserName = newUser;
            spec.userFave = true;
        }
        let scaler = window.topView.querySelector("#scaler");
        scaler.call("PasteUpView", "setFavorite", spec);
    }

    menuSetFave(nameElem, value, faveType, newState) {
        // a click on the session- or user-fave indicator
        if (this.isMenuBeingEdited()) return;

        let appInfo = this.appInfo;
        let url = value;
        let spec = { appInfo, url };
        // in theory, when a user is switching *on* either type of
        // favourite there shouldn't already be a split text
        //    session name | user name
        // in the menu entry.  but it doesn't hurt to parse.
        if (faveType === "session") {
            spec.sessionFave = newState;
            if (newState) spec.proposedSessionName = this.parseFaveText(nameElem.textContent)[0];
        } else if (faveType === "user") {
            spec.userFave = newState;
            if (newState) spec.proposedUserName = this.parseFaveText(nameElem.textContent)[1];
        }
        let scaler = window.topView.querySelector("#scaler");
        scaler.call("PasteUpView", "setFavorite", spec);
    }
}

export class UtilityButton {
    constructor(managerView, spec) {
        this.managerView = managerView;

        let { label, iconName, buttonAction, hoverInverted, hoverSuppressed } = spec;
        this.buttonAction = buttonAction;

        this.dom = document.createElement("div");
        this.dom.classList.add("tool-button");
        managerView.setIconAndLabel(this.dom, iconName, label, null, hoverInverted);
        if (hoverSuppressed) this.dom.classList.add("hover-suppressed");

        this.dom.addEventListener("pointerup", _evt => this.click(), false);
    }

    click() {
        window.topView.querySelector("#pad").call("TransformView", this.buttonAction);
    }
}

export class FileButton {
    constructor(managerView, spec) {
        this.managerView = managerView;

        let { label, iconName } = spec;

        this.dom = document.createElement("div");
        this.dom.classList.add("tool-button");
        managerView.setIconAndLabel(this.dom, iconName, label);

        this.setUpInput();
    }

    async setUpInput() {
        // a file-selection dialog can filter on file types and/or extensions.however, according to a feb 2021 note in https://caniuse.com/input-file-accept, iOS Safari doesn't understand extensions.  so we use file types, adding "text/*" on the assumption that the converter can generally handle text.
        // Chrome is liberal in its application of the filter, using behind-the-scenes rules to include some files that don't match (whether using extension or type).  what the user picks therefore needs to be checked again for falling within our supported range.
        // additionally, among the file formats supported by our converter are many with type specified as application/octet-stream.  since that would cover a gamut of obscure application content that we'd rather not be sending to the converter, the filter after selection - see PasteUpView.getAppForFile - is based on the extension (spoofable though it is) plus type "text/*".
        let scaler = window.topView.querySelector("#scaler"); // PasteUpView
        let fileTypes = (await scaler.call("PasteUpView", "getAllDroppableFileFormats")).types;
        // every explicitly listed type, plus text/*
        let fileSpecifier = fileTypes.concat(["text/*"]).join(",");
        let inputDiv = document.createElement("div");
        inputDiv.style.display = "none";
        inputDiv.innerHTML = `<input type="file" id="field" name="field" accept="${fileSpecifier}">`;
        let inputElem = inputDiv.querySelector("input");
        inputElem.addEventListener("change", evt => this.handleInputChange(evt));
        this.dom.appendChild(inputDiv);
        this.dom.addEventListener("pointerup", _evt => inputElem.click(), false);
    }

    handleInputChange(evt) {
        this.managerView.publishToAll({ name: null }); // remove any tool selection

        let fileList = evt.target.files;
        if (fileList.length) {
            this.managerView.publish(this.managerView.sessionId, "fileUpload", fileList);
        }
    }
}
