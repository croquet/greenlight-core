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

export class PasteUpSaver3 {
    constructor() {
        this.map = {};
        this.id = 0;
    }

    newId() {
        return (++this.id).toString().padStart(4, '0');
    }

    varName(key) {
        let id = this.map[key];
        if (!id) {
            id = "e_" + this.newId();
            this.map[key] = id;
        }
        return id;
    }

    save(model, optFrames, asTemplate) {
        let [resultArray, resultDict, otherDict] = this.collectFrames(model, optFrames, asTemplate);
        return this.json(resultArray, resultDict, otherDict);
    }

    collectFrames(parent, optFrames, asTemplate) {
        // okay, we only collect frames
        let resultArray = [];
        let resultDict = new Map();
        let otherDict = new Map();
        let children = parent.childNodes.slice();
        children = children.filter(e => e.hasHandler("FrameModel"));

        if (optFrames) {
            children = children.filter(e => optFrames.find(f => f === e));
        }

        children = children.sort((a, b) => {
            let z = (e) => e.style.getPropertyValue("z-index") || 0;
            return z(a) - z(b);
        });

        children.forEach((child) => {
            let target = child.getElement(child._get("target"));
            let value = this.frameInfo(child, target, otherDict, asTemplate);
            let key = child.asElementRef().asKey();
            resultDict.set(key, value);
            resultArray.push(key);
        });
        return [resultArray, resultDict, otherDict];
    }

    frameInfo(frame, target, otherDict, asTemplate) {
        let result = new Map();
        result.set("target", this.storeTarget(target, null, otherDict, asTemplate ? target : null));
        this.set(result, "scriptingDataObject", frame.getScriptingDataObject());
        result.set("transform", frame.getTransform());
        return result;
    }

    json(resultArray, resultDict, otherDict) {
        let array = resultArray.map(k => resultDict.get(k));
        return [array, otherDict];
    }

    allNodesCollect(parent, elem, func, resultArray, resultDict) {
        if (resultArray === undefined) {
            resultArray = [];
            resultDict = new Map();
        }

        let value = func(parent, elem);
        resultDict.set(elem.elementId, value);
        resultArray.push(elem.elementId);
        let children = elem.childNodes;
        for (let i = 0; i < children.length; i++) {
            let child = elem.getElement(children[i].elementId);
            this.allNodesCollect(elem, child, func, resultArray, resultDict);
        }
        return [resultArray, resultDict];
    }

    localUrl(url) {
        // @@ temporary: copied from VideoChatView, and patched

        if (url.startsWith("http")) { return url; }

        let path = window.location.origin + window.location.pathname;
        let hostname = window.location.hostname;

        if (hostname === "localhost" || hostname.endsWith(".ngrok.io")) {
            // many bets are off
            if (!url.startsWith("./apps/")) {
                return new URL(url, "https://croquet.io/dev/greenlight/").toString();
            }
        }

        // until we changes the situation here
        if (path.indexOf("files/v1/pitch") >= 0) {
            return new URL(url, "https://croquet.io/dev/greenlight/").toString();
        }

        // And we have another case where the system is installed somewhere else
        if (path.indexOf("croquet.io/events/") >= 0) {
            return new URL(url, "https://croquet.io/greenlight/").toString();
        }

        if (url.startsWith(".")) { return new URL(url, path).toString(); }
        throw new Error("unrecognized URL fragment");
    }

    urlFromTemplate(urlTemplate) {
        let randomSessionId = Math.floor(Math.random() * 36 ** 10).toString(36);
        /* eslint-disable no-template-curly-in-string */
        let relativeUrl = urlTemplate.replace("${q}", randomSessionId);
        return this.localUrl(relativeUrl);
    }

    set(map, key, value) {
        if (value === undefined || typeof value === "string" && value.trim().length === 0) {
            return;
        }
        map.set(key, value);
    }

    storeTarget(elem, parent, otherDict, owner) {
        let result = new Map();

        result.set("key", elem.asElementRef().asKey());
        result.set("elementClass", elem.constructor.name || "Element");

        let scriptingDataObject = elem.getScriptingDataObject();
        if (owner) {
            let appInfo = owner._get("appInfo");
            if (elem.constructor.name === "IFrameElement" && appInfo && appInfo.urlTemplate) {
                let url = this.urlFromTemplate(appInfo.urlTemplate);
                let src = scriptingDataObject.get("me").get("src");
                if (src) {
                    scriptingDataObject.get("me").set("src", url);
                }
            }
        }
        this.set(result, "scriptingDataObject", scriptingDataObject);
        this.set(result, "style", elem.getStyleString());
        this.set(result, "innerHTML", elem.innerHTML);
        this.set(result, "listeners", elem.getListenersInfo());
        this.set(result, "code", JSON.stringify(elem.getCode()));
        this.set(result, "viewCode", JSON.stringify(elem.getViewCode()));

        if (elem._get("_useCustomSaver")) {
            let custom = elem.call(...elem._get("_useCustomSaver"), this);
            result = new Map([...result, ['children', []], ...custom]);
        } else {
            let children = elem.childNodes;
            let childResult = [];
            children.forEach((child) => {
                let childKey = this.storeTarget(child, this, otherDict, owner);
                childResult.push(childKey);
            });
            result.set("children", childResult);
        }
        otherDict.set(result.get("key"), result);

        if (elem.constructor.name === "TextElement") {
            // somewhat redundant in the presence of the custom saver mechanism...
            result.set("text", {
                runs: elem.doc.runs,
                defaultFont: elem.doc.defaultFont,
                defaultSize: elem.doc.defaultSize
            });
        }
        return result.get("key");
    }

    loadTarget(key, otherDict, parent) {
        let root = otherDict.get(key);
        let elem = parent.createElement(root.get("elementClass"));
        elem.setScriptingDataObject(root.get("scriptingDataObject"));
        elem.setStyleString(root.get("style"));
        elem.innerHTML = root.get("innerHTML");
        elem.setListenersInfo(root.get("listeners"));
        root.get("children").forEach((childKey) => {
            elem.appendChild(this.loadTarget(childKey, otherDict, parent));
        });
        elem.setCode(JSON.parse(root.get("code")));
        elem.setViewCode(JSON.parse(root.get("viewCode")));

        if (elem._get("_useCustomLoader")) {
            elem.call(...elem._get("_useCustomLoader"), this, root);
        }

        if (root.get("elementClass") === "TextElement" && root.get("text")) {
            let json = root.get("text");
            elem.setDefault(json.defaultFont, json.defaultSize);
            elem.load(json.runs);
        }
        return elem;
    }

    load(data, parent) {
        let [frames, otherDict] = data;
        return frames.map((dict) => {
            let frame = parent.createElement();
            let target = this.loadTarget(dict.get("target"), otherDict, parent);
            let transform = dict.get("transform");
            frame.setTransform(transform);
            frame.setScriptingDataObject(dict.get("scriptingDataObject"));

            frame.setCode("boards.FrameModel");
            frame.setViewCode("boards.FrameView");
            frame.call("FrameModel", "setObject", target, {x: transform[4], y: transform[5]});
            frame.call("FrameModel", "beSolidBackground");
            return frame;
        });
    }
}
