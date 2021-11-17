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

export class PasteUpSaver {
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
        let resultDict = [];
        let otherDict = {};
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
            resultDict[key] = value;
            resultArray.push(key);
        });
        return [resultArray, resultDict, otherDict];
    }

    frameInfo(frame, target, otherDict, asTemplate) {
        let result = {};
        result["target"] = this.storeTarget(target, null, otherDict, asTemplate ? target : null);
        result["scriptingInfo"] = frame.getScriptingInfo();
        result["transform"] = JSON.stringify(frame.getTransform());
        return result;
    }

    json(resultArray, resultDict, otherDict) {
        let frameSaveOrder = [
            "target", "scriptingInfo", "transform"
        ];

        let frames = [];
        for (let i = 0; i < resultArray.length; i++) {
            let key = resultArray[i];
            let inDict = resultDict[key];

            let outDict = {};
            frameSaveOrder.forEach((k) => {
                let entry = inDict[k];
                if (entry === undefined || entry.trim().length === 0) {return;}
                outDict[k] = entry;
            });
            frames[i] = outDict;
        }

        let otherSaveOrder = [
            "elementClass", "scriptingInfo", "children", "style", "innerHTML", "listeners", "code", "viewCode", "text"
        ];

        let other = {};

        for (let key in otherDict) {
            let inDict = otherDict[key];
            let outDict = {};
            otherSaveOrder.forEach((k) => {
                let entry = inDict[k];
                if (entry === undefined || entry.trim().length === 0) {return;}
                outDict[k] = entry;
            });
            other[inDict.key] = outDict;
        }
        return [frames, other];
    }

    allNodesCollect(parent, elem, func, resultArray, resultDict) {
        if (resultArray === undefined) {
            resultArray = [];
            resultDict = [];
        }

        let value = func(parent, elem);
        resultDict[elem.elementId] = value;
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

    storeTarget(elem, parent, otherDict, owner) {
        let result = {};

        result["key"] = elem.asElementRef().asKey();
        result["elementClass"] = elem.constructor.name || "Element";

        let scriptingInfo = elem.getScriptingInfo();
        if (owner) {
            let appInfo = owner._get("appInfo");
            if (elem.constructor.name === "IFrameElement" && appInfo && appInfo.urlTemplate) {
                let url = this.urlFromTemplate(appInfo.urlTemplate);
                scriptingInfo = scriptingInfo.replace(/^src: .*$/m, `src: "${url}"`);
            }
        }
        result["scriptingInfo"] = scriptingInfo;
        result["style"] = elem.getStyleString();
        result["innerHTML"] = elem.innerHTML;
        result["listeners"] = elem.getListenersInfo();
        result["code"] = JSON.stringify(elem.getCode());
        result["viewCode"] = JSON.stringify(elem.getViewCode());

        if (elem._get("_useCustomSaver")) {
            let custom = elem.call(...elem._get("_useCustomSaver"), this);
            result = {...result, ...{children: "[]"}, ...custom};
        } else {
            let children = elem.childNodes;
            let childResult = [];
            children.forEach((child) => {
                let childKey = this.storeTarget(child, this, otherDict, owner);
                childResult.push(childKey);
            });
            result["children"] = JSON.stringify(childResult);
        }
        otherDict[result.key] = result;

        if (elem.constructor.name === "TextElement") {
            // somewhat redundant in the presence of the custom saver mechanism...
            result["text"] = JSON.stringify({
                runs: elem.doc.runs,
                defaultFont: elem.doc.defaultFont,
                defaultSize: elem.doc.defaultSize
            });
        }
        return result.key;
    }

    loadTarget(key, otherDict, parent) {
        let root = otherDict[key];
        let elem = parent.createElement(root["elementClass"]);
        elem.setScriptingInfo(root["scriptingInfo"]);
        elem.setStyleString(root["style"]);
        elem.innerHTML = root["innerHTML"];
        elem.setListenersInfo(root["listeners"]);
        JSON.parse(root["children"]).forEach((childKey) => {
            elem.appendChild(this.loadTarget(childKey, otherDict, parent));
        });
        elem.setCode(JSON.parse(root["code"]));
        elem.setViewCode(JSON.parse(root["viewCode"]));

        if (elem._get("_useCustomLoader")) {
            elem.call(...elem._get("_useCustomLoader"), this, root);
        }

        if (root["elementClass"] === "TextElement" && root["text"]) {
            let json = JSON.parse(root["text"]);
            elem.setDefault(json.defaultFont, json.defaultSize);
            elem.load(json.runs);
        }

        return elem;
    }

    load(data, parent) {
        let [frames, otherDict] = data;
        return frames.map((dict) => {
            let frame = parent.createElement();
            let target = this.loadTarget(dict["target"], otherDict, parent);
            let transform = JSON.parse(dict["transform"]);
            frame.setTransform(transform);
            frame.setScriptingInfo(dict["scriptingInfo"]);

            frame.setCode("boards.FrameModel");
            frame.setViewCode("boards.FrameView");
            frame.call("FrameModel", "setObject", target, {x: transform[4], y: transform[5]});
            frame.call("FrameModel", "beSolidBackground");
            return frame;
        });
    }
}
