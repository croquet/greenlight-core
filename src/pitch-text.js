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

class TextModel {
    setup(width, height) {
        let text = this.createElement("TextElement");
        let randomString = Math.floor(Math.random() * 36 ** 10).toString(36);
        text.domId = "text" + randomString;
        text.style.setProperty("font-family", "OpenSans-Regular");

        text.style.setProperty("-cards-text-margin", "2px 10px 10px 10px");
        text.setDefault("OpenSans-Regular", 16);

        this.text = text;
        this.setExtent(width, height);

        this.style.setProperty("-cards-direct-manipulation", true);
        this.style.setProperty("width", width + "px");
        this.style.setProperty("height", height + "px");

        this.setTransform([1, 0, 0, 1, 0 ,0]);

        this.appendChild(text);

        let palette = this.createElement();
        palette.domId = "palette";
        palette.setCode("text.WidgetModel");
        palette.setViewCode("text.WidgetView");
        palette._set("text", text.domId);
        this.appendChild(palette);

        this._set("_useSetExtent", ["TextModel", "setExtent"]);
        this._set("_useCustomSaver", ["TextModel", "saveData"]);
        this._set("_useCustomLoader", ["TextModel", "loadData"]);
        this._set("desiredFrameType", "stickyNote");
    }

    setExtent(width, height) {
        this.style.setProperty("width", width + "px");
        this.style.setProperty("height", height + "px");
        this.text.style.setProperty("height", height + "px");
        this.text.setWidth(width);
    }

    saveData(_saver) {
        let func = () => {
            let top = this.wellKnownModel("modelRoot");
            let result = new Map();
            result.set("text", top.stringify(this.text.save()));
            return result;
        };
        return func();
    }

    loadData(_saver, data) {
        let width = parseFloat(this.style.getPropertyValue("width"));
        let height = parseFloat(this.style.getPropertyValue("height"));

        let top = this.wellKnownModel("modelRoot");
        let json;
        if (data.constructor === window.Map) {
            json = data.get("text");
        } else {
            json = data["text"];
        }
        let text = top.parse(json);
        this.setup(width, height);
        this.text.setDefault(text.defaultFont, text.defaultSize);
        this.text.setWidth(width);
        this.text.load(text.runs);
    }
}

class WidgetModel {
    init() {
        if (!this._get("initialized")) {
            this._set("initialized", true);
            let panel = this.createElement("div");
            panel.classList.add("text-menu-top");

            let boldButton = this.createElement();
            boldButton.domId = "boldButton";
            boldButton.classList.add("text-face-button");
            boldButton.setCode("widgets.Button");
            boldButton.call("Button", "beViewButton", "Off", "<b style='font-family: serif'>B</b>", "text-face-bold", "Bold");
            boldButton.addDomain(this.id, "bold");

            let italicButton = this.createElement();
            italicButton.domId = "italicButton";
            italicButton.classList.add("text-face-button");
            italicButton.setCode("widgets.Button");
            italicButton.call("Button", "beViewButton", "Off", "<i style='font-family: serif'>I</i>", "text-face-italic", "Italic");
            italicButton.addDomain(this.id, "italic");

            let size = this.createElement();
            size.domId = "size";
            size.innerHTML = "size";
            size.classList.add("text-menu-item");
            let color = this.createElement();
            color.domId = "color";
            color.innerHTML = "color";
            color.classList.add("text-menu-item");

            panel.appendChild(boldButton);
            panel.appendChild(italicButton);
            panel.appendChild(size);
            panel.appendChild(color);

            this.appendChild(panel);
        }
    }
}

class WidgetView {
    init() {
        let size = this.querySelector("#size");
        size.dom.addEventListener("click", (evt) => this.launchSizeMenu(evt));
        let color = this.querySelector("#color");
        color.dom.addEventListener("click", (evt) => this.launchColorMenu(evt));

        let boldButton = this.querySelector("#boldButton");
        boldButton.dom.addEventListener("click", (evt) => this.bold(evt));

        let italicButton = this.querySelector("#italicButton");
        italicButton.dom.addEventListener("click", (evt) => this.italic(evt));

        let target = window.topView.querySelector(`#${this.model._get("text")}`);
        this.subscribe(target.id, "selectionUpdated", "selectionUpdated");

        let selection = this.getSelection();
        this.hasBoxSelection = !!(selection && (selection.start !== selection.end));
        this.selectionUpdated(true);
        // console.log("WidgetView.init");
    }

    getSelection() {
        let target = window.topView.querySelector(`#${this.model._get("text")}`);
        return target.model.content.selections[this.viewId];
    }

    dismissMenu() {
        if (this.menu) {
            this.menu.remove();
            this.menu = null;
        }
    }

    launchSizeMenu(_evt) {
        if (this.menu) {
            this.dismissMenu();
            return;
        }
        this.menu = this.makeSizeMenu();
        this.dom.appendChild(this.menu);
    }

    launchColorMenu(_evt) {
        if (this.menu) {
            this.dismissMenu();
            return;
        }
        this.menu = this.makeColorMenu();
        this.dom.appendChild(this.menu);
    }

    makeSizeMenu() {
        return this.makeMenu(["8", "12", "16", "20", "24"]);
    }

    makeColorMenu() {
        return this.makeMenu(["black", "blue", "green", "red"]);
    }

    makeMenu(items) {
        let select = document.createElement("div");
        select.classList.add("text-menu", "no-select");

        items.forEach((value) => {
            let opt = this.makeMenuItem(null, value, value);
            select.appendChild(opt);
        });

        let div = document.createElement("div");
        div.classList.add("text-menu-holder");
        div.appendChild(select);
        return div;
    }

    makeMenuItem(assetName, value, label) {
        let opt = document.createElement("div");

        if (value === null) {
            opt.classList.add("no-select", "text-menu-title");
            opt.innerHTML = `<span>${label}</span>`;
            return opt;
        }
        opt.classList.add("no-select", "text-menu-item");

        let html = "";
        if (assetName) {
            let sectionName = "img-" + assetName;
            html = `<div class="frame-menu-icon"><svg viewBox="0 0 24 24" class="frame-menu-icon-svg"><use href="#${sectionName}"></use></svg></div>`;
        }
        html += `<span class="text-menu-label">${label}</span>`;
        opt.innerHTML = html;
        opt.value = value;
        opt.addEventListener("click", (evt) => this.menuSelected(evt), true);
        return opt;
    }

    menuSelected(evt) {
        let value = evt.currentTarget.value;
        let target = window.topView.querySelector(`#${this.model._get("text")}`);
        let style;

        if (/^[0-9]/.test(value)) {
            value = parseInt(value, 10);
            style = {size: value};
        } else {
            style = {color: value};
        }

        target.mergeStyle(style);
    }

    selectionUpdated(firstTime) {
        let hadBoxSelection = this.hasBoxSelection;

        let target = window.topView.querySelector(`#${this.model._get("text")}`);
        let selection = target.model.content.selections[this.viewId];
        this.hasBoxSelection = !!(selection && (selection.start !== selection.end));

        if (selection) {
            let style = target.model.styleAt(selection.start);

            let state = style && style.italic ? "On" : "Off";
            let italicButton = this.querySelector("#italicButton");
            italicButton.call("ButtonView", "setButtonState", state, italicButton.model._get("label"), italicButton.model._get("class"), italicButton.model._get("title"));

            state = style && style.bold ? "On" : "Off";
            let boldButton = this.querySelector("#boldButton");
            boldButton.call("ButtonView", "setButtonState", state, boldButton.model._get("label"), boldButton.model._get("class"), boldButton.model._get("title"));
        }

        if (!firstTime && hadBoxSelection === this.hasBoxSelection) {return;}

        if (firstTime || (hadBoxSelection && !this.hasBoxSelection)) {
            this.dismissMenu();
            this.dom.style.setProperty("display", "none");
            return;
        }

        let rects = target.warota.selectionRects(selection);
        this.dom.style.removeProperty("display");

        let x = rects[0].left + (rects[0].width / 2);
        let y = rects[0].top + rects[0].height + 5;

        this.dom.style.setProperty("position", "absolute");
        this.dom.style.setProperty("left", x + "px");
        this.dom.style.setProperty("top", y + "px");
    }

    bold() {
        console.log("bold");
        let target = window.topView.querySelector(`#${this.model._get("text")}`);
        let button = this.querySelector("#boldButton");
        let state = button.dom.getAttribute("buttonState") !== "On";
        let style;

        style = {bold: state};
        target.mergeStyle(style);
        button.call("ButtonView", "setButtonState", state, button.model._get("label"), button.model._get("class"), button.model._get("title"));
    }

    italic() {
        console.log("italic");
        let target = window.topView.querySelector(`#${this.model._get("text")}`);
        let button = this.querySelector("#italicButton");
        let state = button.dom.getAttribute("buttonState") !== "On";
        let style;

        style = {italic: state};
        target.mergeStyle(style);
        button.call("ButtonView", "setButtonState", state, button.model._get("label"), button.model._get("class"), button.model._get("title"));
    }
}

export const text = {
    expanders: [TextModel, WidgetModel, WidgetView],
    functions: []
};
