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

class MiniBrowser {
    init() {
        let iframe = this.querySelector("#iframe");
        if (!iframe) {
            this.style.setProperty("background-color", "white");
            this.style.setProperty("display", "flex");
            this.style.setProperty("flex-direction", "column");
            this.style.setProperty("align-items", "center");
            this.style.setProperty("user-select", "none");

            if (!this._get("useExternalAddress")) {
                let address = this.createElement("TextElement");
                address.domId = "address";
                address.style.setProperty("-cards-text-margin", "0px 4px 0px 4px");
                address.style.setProperty("-cards-text-singleLine", true);

                address.style.setProperty("height", "22px");
                address.style.setProperty("width", "80%");
                address.style.setProperty("border", "1px solid black");
                address.style.setProperty("margin", "4px");
                address._set("enterToAccept", true);
                this.subscribe(address.id, "text", "urlFromText");
                this.appendChild(address);

                let button = this.createElement();
                button.setViewCode("minibrowser.QRView");
                button.style.setProperty("position", "absolute");
                button.style.setProperty("top", "5px");
                button.style.setProperty("right", "4px");
                button.style.setProperty("width", "24px");
                button.style.setProperty("height", "24px");
                button.style.setProperty("background-image", `url(${this.getLibrary("minibrowser.QRIcon").iconString()})`);
                button.style.setProperty("background-size", "24px 24px");
                this.appendChild(button);
            }

            iframe = this.createElement("IFrameElement");
            iframe.domId = "iframe";
            iframe.classList.add("boards-iframe", "no-select");
            iframe.style.setProperty("width", "100%");
            iframe.style.setProperty("flex-grow", "10");
            iframe.style.setProperty("border", "0px solid gray");

            iframe._set("allow", "camera; microphone; encrypted-media");
            // iframe._set("sandbox", "allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-presentation allow-same-origin allow-scripts");  now handled as part of setAppInfo
            this.appendChild(iframe);

            this.cover = this.createElement();
            this.cover.domId = "iframeCover";
            this.cover.classList.add("boards-iframeCover", "no-select");
            this.cover.style.setProperty("width", "100%");
            this.cover.style.setProperty("height", "100%");
            this.cover.style.setProperty("position", "absolute");
            this.appendChild(this.cover);

            this._set("_useSetExtent", ["MiniBrowser", "setExtent"]);
            this._set("menuItems", [
                {value: "OpenInANewTab", label: "Open in a New Tab", traits: null, method: "openTab"}, // a method of FrameMenuView
                {value: "BeTransparent", label: "Be transparent", traits: null, method: "beTransparent", asset: "make-trans"}, // ditto
            ]);
        }

        this.subscribe(this.id, "beTransparent", "updateTransparency"); // published by a FrameMenuView
        this.subscribe(this.id, "setAppInfo", "setAppInfo");
        console.log("MiniBrowser.init");
    }

    setCoverContent(appName) {
        switch (appName) {
            case "googleworkspace":
                this.cover.innerHTML = this.getLibrary("minibrowser.GoogleContent").coverPage();
                break;
            default:
        }
    }

    setExtent(width, height) {
        if (width === undefined && height === undefined) {
            width = parseFloat(this.style.getPropertyValue("width"));
            height = parseFloat(this.style.getPropertyValue("height"));
        }
        this.style.setProperty("width", width + "px");
        this.style.setProperty("height", height + "px");

        let address = this.getAddressBar();
        if (address) {
            address.setWidth(width - 112); // @@ hack - we'd like to let the field size itself, but text element seems to need an absolute width value
        }
    }

    setAppInfo(appInfo) {
        this._set("appInfo", appInfo);
        let transparent = appInfo && appInfo.transparent;
        this.updateTransparency(transparent);
        let sandboxed = !(appInfo && appInfo.noSandbox);
        this.setSandbox(sandboxed);
    }

    setSandbox(sandboxed) {
        let iframe = this.querySelector("#iframe");
        if (!iframe) return;

        if (sandboxed) {
            iframe._set("sandbox", "allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-presentation allow-same-origin allow-scripts");
        }
    }

    setCreatingUser(userId) {
        this._set("creatingUser", userId);
    }

    getAddressBar() {
        if (!this._get("useExternalAddress")) {
            return this.querySelector("#address");
        }
        let info = this._get("addressBarInfo");
        if (!info) {return null;}
        return this.getElement(info);
    }

    getURL() {
        let iframe = this.querySelector("#iframe");
        return iframe && iframe._get("src");
    }

    updateTransparency(flag) {
        // invoked with a flag value when handling "beTransparent" event
        // from FrameMenuView, or without a flag just to get the MiniBrowser
        // to bring its style into line with the current setting and
        // publish an event to make the MiniBrowserView tell the
        // embedded app.
        if (flag !== undefined) {
            this._set("transparent", flag);
            let items = this._get("menuItems");
            function updateMenuItems(menuItems) {
                let index = menuItems.findIndex(m => m.method === "beTransparent" || m.method === "beOpaque");
                return [
                    ...menuItems.slice(0, index),
                    {value: flag ? "BeOpaque" : "BeTransparent",
                     label: flag ? "Be opaque" : "Be transparent",
                     method: flag ? "beOpaque" : "beTransparent",
                     asset: flag ? "make-opaque" : "make-trans"
                    },
                    ...menuItems.slice(index + 1)];
            }
            this._set("menuItems", updateMenuItems(items));
        }
        let iframe = this.querySelector("#iframe");
        if (this._get("transparent") && iframe && iframe._get("src")) {
            this.style.setProperty("background-color", "#FFFFFF02");
        } else {
            this.style.setProperty("background-color", "white");
        }
        this.publish(this.id, "updateTransparency"); // subscribed to by MiniBrowserView
    }

    urlFromText(data) {
        this.url(data.text);
    }

    url(url, inInitialization) {
        if (typeof url !== "string") {url = "";}
        url = url.trim();
        let iframe = this.querySelector("#iframe");
        if (!iframe) {return;}

        if (url.length === 0) {
            iframe._set("src", "");
            this.announceUrlChanged();
            this.updateTransparency();
            this.removeCover();
            return;
        }

        if (!url.startsWith("https://") && !url.startsWith("http://")) {
            url = window.location.protocol + "//" + url;
        }

        if (window.location.protocol === "https:" && url.startsWith("http://")) {
            url = window.location.protocol + "//" + url.slice("http://".length);
        }

        console.log("showing: " + url);
        let address = this.getAddressBar();
        if (address) {
            address.value = url;
        }

        iframe._set("src", url);
        if (!inInitialization) {
            this.announceUrlChanged();
        }
        this.updateTransparency();
        this.removeCover();
    }

    announceUrlChanged() {
        //this.publish(this.sessionId, "triggerPersist");
        // make sure the view knows that the url has changed
        this._set("appInfo", null);
        this.publish(this.id, "urlChanged");
    }

    removeCover() {
        if (this.cover) {
            this.cover.remove();
            this.cover = null;
        }
    }

    comeUpFullyOnReload() {
        let iframe = this.querySelector("#iframe");
        if (!iframe) {return;}
        let width =  parseFloat(this.style.getPropertyValue("width"));
        let height =  parseFloat(this.style.getPropertyValue("height"));

        let url = iframe._get("src");
        this.url(url, true);

        // this is tricky but reinstate an appInfo that was lost due to a bug.
        if (typeof url === "string" && url.indexOf("cobrowser-single") >= 0 && !this._get("appInfo")) {
            this._set("appInfo", {
                label: "web page", iconName: "link.svgIcon",
                /* eslint-disable no-template-curly-in-string */
                urlTemplate: "../cobrowser-single/?q=${q}", order: 10,
                noURLEdit: true,
                noSandbox: true
            });
        }
        this.setExtent(width, height);
    }
}

class MiniBrowserView {
    init() {
        this.subscribe(this.model.id, "updateTransparency", "updateTransparency"); // published by MiniBrowser
        // this.subscribe(this.model.id, "urlChanged", "MiniBrowserView.urlChanged");

        let addressBar = this.model.call("MiniBrowser", "getAddressBar");

        // adjust the FrameAddressEditView according to model state - after a pause,
        // given that the view might not have been initialised yet.

        if (addressBar) {
            // set the visibility of the button itself depending on whether the
            // model's appInfo includes noURLEdit
            let appInfo = this.model._get("appInfo");
            let showButton = !appInfo || !appInfo.noURLEdit;
            this.future(100).publish(addressBar.id, "setButtonVisibility", showButton);

            // and if the model has an empty url, open the address bar
            // for editing.
            let url = this.model.call("MiniBrowser", "getURL");
            if (!url) this.future(100).publish(addressBar.id, "setEditState", true);
        }

        console.log("MiniBrowserView.init");
    }

    getLoadedURL() {
        // the url recorded by the iframe, which can be
        // subtly different from what's in the model
        let iframe = this.dom.querySelector("#iframe");
        return iframe && iframe.src;
    }

    setAppInfo(spec) {
        this.publish(this.model.id, "setAppInfo", spec);
        // well, here it probably should not be doing this, but
        if (spec && spec.transparent) this.future(1000).updateTransparency();
    }

    getAppInfo() {
        return this.model._get("appInfo");
    }

    updateTransparency() {
        // sync with the transparency state held by the MiniBrowser, and
        // signal to the embedded app (if any, and if it is listening)
        let appInfo = this.model._get("appInfo");
        let flag = appInfo && appInfo.transparent;
        let iframe = this.dom.querySelector("#iframe");

        if (Croquet.Messenger.ready) {
            Croquet.Messenger.send("transparency", flag, iframe.contentWindow);
        }
    }

    sendCreatingUser() {
        let userId = this.model._get("creatingUser");
        let iframe = this.dom.querySelector("#iframe");

        if (Croquet.Messenger.ready) {
            Croquet.Messenger.send("creatingUser", { userId }, iframe.contentWindow);
        }
    }
}

class QRView {
    init() {
        this.addEventListener("click", "click");
        // this.dom.draggable = true;
        // this.dom.addEventListener("dragstart", evt => this.startDrag(evt)); // we need the raw DOM event to work with
        // this.dom.addEventListener("dragend", evt => this.endDrag(evt)); // we need the raw DOM event to work with
        this.dom.addEventListener("pointerdown", (evt) => this.pointerDown(evt));

        // console.log("QRView init");
    }

    pointerDown(evt) {
        evt.stopPropagation();
    }

    getBrowserView() {
        return this.parentNode.parentNode.querySelector("#miniBrowser");
    }

    getBrowser() {
        return this.getBrowserView().model;
    }

    getLoadedURL() {
        let browserView = this.getBrowserView();
        return browserView && browserView.call("MiniBrowserView", "getLoadedURL");
    }

    show() {
        if (this.qrElement) return;
        let url = this.getLoadedURL();
        if (!url) return;

        const qrDiv = this.qrElement = document.createElement("div");
        qrDiv.style.position = "absolute";
        qrDiv.style.width = "148px";
        qrDiv.style.height = "148px";
        qrDiv.style.backgroundColor = "white";
        qrDiv.style.top = "8px";
        qrDiv.style.left = `-${146 + 8}px`;
        qrDiv.style.zIndex = "10";

        const { App } = Croquet;
        const urlStore = App.sessionURL;
        App.sessionURL = url;
        const qrCanv = App.makeQRCanvas();
        App.sessionURL = urlStore; // worth restoring, because sessionURL is used as referrerURL
        qrCanv.style.position = "absolute";
        qrCanv.style.top = "10px";
        qrCanv.style.left = "10px";
        qrDiv.appendChild(qrCanv);
        this.dom.appendChild(qrDiv);
    }

    hide() {
        if (this.qrElement) {
            this.dom.removeChild(this.qrElement);
            delete this.qrElement;
        }
    }

    toggle() {
        if (this.qrElement) {
            this.hide();
            return false;
        }

        this.show();
        return true;
    }

    click(_evt) {
        let state = this.toggle();
        if (this.frameViewId) {
            this.publish(this.frameViewId, "qrState", state);
        }
    }

    setFrameView(id) {
        this.frameViewId = id;
    }
}

class QRIcon {
    static iconString() {
        return "data:image/png;base64,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";
    }

    static defaultIcon() {
        return new Promise((resolve, reject) => {
            let img = new Image(80, 80);
            img.src = this.iconString();
            img.onload = () => resolve(img);
            img.onerror = reject;
        });
    }

    static defaultDragImage(optW, optH) {
        return this.defaultIcon().then((img) => {
            // coerce the default icon image into the requested size
            let canv = document.createElement("canvas");
            canv.width = optW || 32;
            canv.height = optH || 32;
            canv.getContext("2d").drawImage(img, 0, 0, canv.width, canv.height);
            let dataURL = canv.toDataURL();
            let sizedImg = new Image();
            sizedImg.src = dataURL;
            return sizedImg;
        });
    }
}

class GoogleContent {
    static coverPage() {
        return `
<div style="height:100%; width:100%; display:flex; flex-direction:column; justify-content:center; align-items:center;">
    <div style="width:100%; margin-bottom:4%; display:flex; flex-direction:row; justify-content:center;">
        <img style="width:10%; margin-right:1%" src="${this.docsIcon()}"/>
        <img style="width:10%; margin-right:1%" src="${this.sheetsIcon()}"/>
        <img style="width:10%; margin-right:1%" src="${this.slidesIcon()}"/>
    </div>
    <div style="width:75%; text-align:center;">
        <span style="font-family:Poppins-Medium; font-size:16px; color:#4586f3">Paste the link for your Google Workspace document in the URL bar above and hit Enter</span>
    </div>
</div>
`;
    }

    static docsIcon() {
        return "data:image/svg+xml,%3Csvg id='Layer_1' data-name='Layer 1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' viewBox='0 0 140 175'%3E%3Cdefs%3E%3CclipPath id='clip-path'%3E%3Crect x='-1512.26' y='-1412.5' width='1937.74' height='1092.52' fill='none'/%3E%3C/clipPath%3E%3C/defs%3E%3Cg clip-path='url(%23clip-path)'%3E%3Cpath d='M115.43-1843.61c4.69,9.39,0,1955,0,1955' fill='none' stroke='%23ddd' stroke-miterlimit='10'/%3E%3Cpath d='M24.35-1843.61c4.7,9.39,0,1955,0,1955' fill='none' stroke='%23ddd' stroke-miterlimit='10'/%3E%3C/g%3E%3Cpath d='M15.39,3.68a12,12,0,0,0-12,12V159.33a12,12,0,0,0,12,12H124.6a12,12,0,0,0,12-12V42L98.34,3.68Z' fill='%234e8bf2'/%3E%3Cpath d='M110.34,41.94h26.27L98.34,3.67V29.94A12,12,0,0,0,110.34,41.94Z' fill='%23a7c6fd'/%3E%3Crect x='37.83' y='74.88' width='64.34' height='8.95' rx='3.98' fill='%23edefed'/%3E%3Crect x='37.83' y='87.89' width='64.34' height='8.95' rx='3.98' fill='%23edefed'/%3E%3Crect x='37.83' y='100.9' width='64.34' height='8.95' rx='3.98' fill='%23edefed'/%3E%3Crect x='37.83' y='113.91' width='38.97' height='8.95' rx='3.98' fill='%23edefed'/%3E%3C/svg%3E";
    }

    static sheetsIcon() {
        return "data:image/svg+xml,%3Csvg id='Layer_1' data-name='Layer 1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' viewBox='0 0 140 175'%3E%3Cdefs%3E%3CclipPath id='clip-path'%3E%3Crect x='-1672.45' y='-1412.5' width='1937.74' height='1092.52' fill='none'/%3E%3C/clipPath%3E%3C/defs%3E%3Cg clip-path='url(%23clip-path)'%3E%3Cpath d='M137.39-1843.61c4.69,9.39,0,1955,0,1955' fill='none' stroke='%23ddd' stroke-miterlimit='10'/%3E%3Cpath d='M46.31-1843.61c4.7,9.39,0,1955,0,1955' fill='none' stroke='%23ddd' stroke-miterlimit='10'/%3E%3C/g%3E%3Cpath d='M15.39,3.68a12,12,0,0,0-12,12V159.33a12,12,0,0,0,12,12H124.6a12,12,0,0,0,12-12V42L98.34,3.68Z' fill='%2323a464'/%3E%3Cpath d='M110.34,41.94h26.27L98.34,3.67V29.94A12,12,0,0,0,110.34,41.94Z' fill='%238ed0b4'/%3E%3Crect x='34.55' y='68.63' width='70.89' height='60.49' rx='7.2' fill='%23edefed'/%3E%3Cpath d='M42.48,118.4c2.07,0,4.14-.1,6.21-.1,6.27,0,12.9,1.29,17.51-4.79l-.12,6.35L63.48,121l-19.24,0-1.5-1a8.8,8.8,0,0,1-.35-1C42.35,118.77,42.45,118.58,42.48,118.4Z' fill='%23139e5b'/%3E%3Cpath d='M42.81,102.41l4.5.84C45.72,103.48,43.92,104.82,42.81,102.41Z' fill='%2323a464'/%3E%3Cpath d='M63.48,121l2.6-1.14C65.76,121.5,64.69,121.4,63.48,121Z' fill='%2323a464'/%3E%3Cpath d='M42.74,119.91l1.5,1C43.24,121.33,42.74,121,42.74,119.91Z' fill='%2323a464'/%3E%3Crect x='42.27' y='75.35' width='23.93' height='10.9' rx='3.2' fill='%2323a464'/%3E%3Crect x='42.27' y='93.34' width='23.93' height='10.9' rx='3.2' fill='%2323a464'/%3E%3Crect x='42.27' y='111.33' width='23.93' height='10.9' rx='3.2' fill='%2323a464'/%3E%3Crect x='73.3' y='75.35' width='23.93' height='10.9' rx='3.2' fill='%2323a464'/%3E%3Crect x='73.3' y='93.34' width='23.93' height='10.9' rx='3.2' fill='%2323a464'/%3E%3Crect x='73.3' y='111.33' width='23.93' height='10.9' rx='3.2' fill='%2323a464'/%3E%3C/svg%3E";
    }

    static slidesIcon() {
        return "data:image/svg+xml,%3Csvg id='Layer_1' data-name='Layer 1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' viewBox='0 0 140 175'%3E%3Cdefs xmlns='http://www.w3.org/2000/svg'%3E%3Cpath id='a' d='M-1823.4 -1412.5H114.33999999999992V-319.98H-1823.4z'/%3E%3C/defs%3E%3CclipPath xmlns='http://www.w3.org/2000/svg' id='b'%3E%3Cuse overflow='visible' xmlns:xlink='http://www.w3.org/1999/xlink' xlink:href='%23a'/%3E%3C/clipPath%3E%3Cg xmlns='http://www.w3.org/2000/svg' clip-path='url(%23b)'%3E%3Cpath fill='none' stroke='%23DDDDDD' stroke-miterlimit='10' d='M77.51-1843.61c4.7,9.39,0,1954.96,0,1954.96'/%3E%3C/g%3E%3Cpath xmlns='http://www.w3.org/2000/svg' fill='%23F3B507' d='M15.39,3.68c-6.6,0-12,5.4-12,12v143.65c0,6.6,5.4,12,12,12H124.6c6.6,0,12-5.4,12-12V41.95L98.34,3.68 H15.39z'/%3E%3Cpath xmlns='http://www.w3.org/2000/svg' fill='%23FCDE95' d='M110.34,41.94h26.27L98.34,3.67v26.27C98.34,36.54,103.74,41.94,110.34,41.94z'/%3E%3Cpath xmlns='http://www.w3.org/2000/svg' fill='%23EDEFED' d='M95.29,128.29H49.03c-4.99,0-9.04-4.05-9.04-9.04V72.63c0-4.99,4.05-9.04,9.04-9.04h46.26 c4.99,0,9.04,4.05,9.04,9.04v46.61C104.34,124.24,100.29,128.29,95.29,128.29z'/%3E%3Cpath xmlns='http://www.w3.org/2000/svg' fill='%23F3B507' d='M88.86,109.68H55.47c-4.03,0-7.3-3.27-7.3-7.3V89.5c0-4.03,3.27-7.3,7.3-7.3h33.39c4.03,0,7.3,3.27,7.3,7.3 v12.87C96.16,106.41,92.89,109.68,88.86,109.68z'/%3E%3C/svg%3E";
    }
}

function beBrowser(parent, _json) {
    parent.setStyleClasses(`.no-select {
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
}`);
    let holder = parent.createElement();
    holder.setCode("minibrowser.MiniBrowser");
    holder.setViewCode("minibrowser.MiniBrowserView");
    holder.style.setProperty("-cards-direct-manipulation", true);
    holder.call("MiniBrowser", "setExtent", 800, 600);
    holder.setTransform("1,0,0,1,0,0");

    parent.appendChild(holder);
}

export const minibrowser = {
    expanders: [
        MiniBrowser, MiniBrowserView,
        QRView
    ],
    functions: [beBrowser],
    classes: [QRIcon, GoogleContent]
};
