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

// Annotation tool

// Some requirements, or things known as cutting corners.

// We cannot make a drawing area as big as the scaler. We start with the canvas that is as big as the screen.
// The coordinates for strokes are recorded in the scaler's frame of reference.
// The line thickness is constant (i.e., tied to the css pixel unit)


// When scrolled, or zoomed we try to redraw the canvas from points. (but see what happens if mulitple people do differet things)

// A simple version will have no view side drawing. We can have the draw under feature but won't help much if it cannot draw under windows.
// as more than one users may draw at the same time, smoothing a line and trying to draw a connected line segments at once won't do. they have to be drawn as linear segment by segment.

// we won't necessarily increase the tick rate.  We'll start with the idea that it is okay to use current 2 tps to clear lines.

// layers: [layer]
// layer: [stroke]// sorted by logical time
// stroke: {viewId, time: <logical time>, x0, y0, x1, y1, color}


// view -> addLine({viewId, x0, y0, x1, y1, color, under: <boolean>, isNew: <boolean>})
//         -> add logical time, based on the over flag, add to a right layer

// The view has a state whether the drawing mode is locked or not. If locked, pointer up does not stop responding.
// if not in the mode, the trail should still be shown but the canvas should not handle events

// model: anobody being active is a shared state
//   anybody activate => request display canvas for all

//   receive any stroke from anybody =>
//               start cleanup process, if not currently running
//               strokes in model updated
//               request view draw

//   cleanup done:
//               stop cleanup process
//               notify cleanup is done

// view:
// local activate => show icon locally,
//             request model to activate
//             install pointer down event handler, if not
//             install pointer move reporter, if not

// somebody activated =>
//             display canvas, if not currently shown

// any stroke => startCleaner if not running
//               draw

// local deactivate => hide icon locally.
//             uninstall pointer down event handler.
//             uninstall pointer move reporter

// my stroke => publish to model

// pen up => local deactivate


// nobody active => hide display
//             uninstall pointer down event handler (just in case)
//             uninstall pointer move reporter (just in case)

// cleanup done =>  stop cleaner;

class DrawModel {
    init() {
        this.subscribe(this.sessionId, "view-exit", "viewExit");
        this.subscribe(this.id, "addLine", "addLine");

        if (!this._get("layers")) {
            this._set("layers", [[]]);
        }

        if (!this._get("layerMap")) {
            this._set("layerMap", {});
        }

        if (this._get("runCleaner") === undefined) {
            this._set("runCleaner", false);
        }

        this._set("delay", 3000);

        console.log("DrawModel.init");
    }

    viewExit(viewId) {
        let map = this._get("layerMap");
        if (map) {
            delete map[viewId];
        }
    }

    addLine(data) {
        let {viewId, x0, y0, x1, y1, color, under, isNew} = data;
        let map = this._get("layerMap");
        let layers = this._get("layers");

        let time = this.now();

        let index;

        if (isNew && under) {
            index = 0;
            map[viewId] = index;
            layers.unshift([]);
        } else {
            index = layers.length - 1;
            map[viewId] = index;
            if (!layers[index]) {
                layers[index] = [];
            }
        }

        let stroke = {viewId, time, x0, y0, x1, y1, color, under};
        layers[index].push(stroke);

        this.publish(this.id, "drawLine", stroke);
        if (!this._get("runCleaner")) {
            this._set("runCleaner", true);
            this.runClear();
        }
    }

    clear() {
        let time = this.now();
        let pastTime = time - (this._get("delay") || 3000);
        let layers = this._get("layers");

        let updated = false;

        let allZero = () => {
            for (let i in layers) {
                if (layers[i].length > 0) {
                    return false;
                }
            }
            return true;
        };

        layers.forEach((layer) => {
            let past = 0;
            for (let i = 0; i <= layer.length; i++) {
                let stroke = layer[i];
                if (i === layer.length) {
                    past = i;
                    break;
                }
                if (stroke.time < pastTime) {
                    continue;
                }
                past = i;
                break;
            }
            if (past > 0) {
                layer.splice(0, past);
                updated = true;
            }
        });
        if (updated) {
            if (allZero()) {
                this._set("layers", [[]]);
                this._set("runCleaner", false);
                this.publish(this.id, "cleanUpDone");
            }
        }
    }

    runClear() {
        this.clear();
        if (!this._get("runCleaner")) {return;}
        this.future(500).call("DrawModel", "runClear");
    }

    loadPersistentData(data) {
        this._set("layers", data);
    }

    savePersistentData() {
        let top = this.wellKnownModel("modelRoot");
        let func = () => this._get("layers");
        top.persistSession(func);
    }
}

class DrawView {
    init() {
        this.subscribe(this.model.id, "drawLine", "handleDrawLine");
        this.subscribe(this.model.id, "drawAll", "drawAll");
        this.subscribe(this.model.id, "cleanUpDone", "cleanUpDone");
        this.subscribe(this.sessionId, "annotationCleanAndDraw", "cleanAndDraw");
        this.subscribe(this.sessionId, "annotationResizeAndDraw", "resizeAndDraw");

        this.ensureScaler();
        this.ensurePad();
        this.localDiff = Date.now() - this.now();
        this.setupCanvas();

        window.topView.detachCallbacks.push(() => {
            this.stopCleaner();
        });

        this.ensureCleanEventHandlers();
        this.setup();

        console.log("DrawView.init");
    }

    ensureScaler() {
        if (!this.scaler) {
            this.scaler = window.topView.querySelector("#scaler");
        }
        return this.scaler;
    }

    ensurePad() {
        if (!this.pad) {
            this.pad = window.topView.querySelector("#pad");
        }
        return this.pad;
    }

    getUserColor() {
        if (this.userColor) {return this.userColor;}
        if (this.scaler) {
            let userInfo = this.scaler.model[this.viewId];
            this.userColor = userInfo && userInfo.userColor || "#00FF00";
        }
        return this.userColor;
    }

    localActivate(color) {
        this.userColor = color;
        this.dom.style.removeProperty("pointer-events");
        this.addEventListener("pointerdown", "pointerDown");
        this.pointerMoveReporter = (evt) => this.reportPointerMove(evt);
        this.dom.addEventListener("pointermove", this.pointerMoveReporter);
    }

    localDeactivate() {
        this.ensureCleanEventHandlers();
    }

    ensureCleanEventHandlers() {
        this.dom.style.setProperty("pointer-events", "none");
        this.removeEventListener("pointerdown", "pointerDown");
        this.removeEventListener("pointerup", "pointerUp");
        this.removeEventListener("pointerleave", "pointerUp");
        this.removeEventListener("lostpointercapture", "pointerUp");
        this.removeEventListener("pointermove", "pointerMove");
        if (this.pointerMoveReporter) {
            this.dom.removeEventListener("pointermove", this.pointerMoveReporter);
            this.pointerMoveReporter = null;
        }
    }

    setup() {
        if (this.pad) {
            let rect = this.pad.dom.getBoundingClientRect();
            let width = rect.width;
            let height = rect.height;
            this.resize(width, height);
        }
        this.startCleaner();
        this.drawAll();
    }

    resize(width, height) {
        if (this.dom.getAttribute("width") !== `${width}`
            || this.dom.getAttribute("height") !== `${height}`) {
            this.dom.setAttribute("width", width);
            this.dom.setAttribute("height", height);
        }
    }

    resizeAndDraw(width, height) {
        if (width && height) {
            this.resize(width, height);
        }

        this.startCleaner();
        this.drawAll();
    }

    cleanUpDone() {
        console.log("cleanup done");
        this.clear();
        this.stopCleaner();
    }

    setupCanvas() {
        if (this.canvas) {return;}

        let canvasId = this.model._get("canvasId");
        if (canvasId) {
            if (this.dom.id === canvasId) {
                this.canvas = this.dom;
                return;
            }
            this.canvas = this.dom.querySelector(`#${canvasId}`);
            if (this.canvas) {
                return;
            }
        }
        this.canvas = document.createElement("canvas");
        this.dom.appendChild(this.canvas);
    }

    startCleaner() {
        if (this.cleaner) {return;}

        let allZero = () => {
            let layers = this.model._get("layers");
            if (!layers) {return true;}
            for (let i in layers) {
                if (layers[i].length > 0) {
                    return false;
                }
            }
            return true;
        };

        if (allZero()) {return;}
        this.cleaner = setInterval(() => this.cleanAndDraw(), 33);
    }

    stopCleaner() {
        if (!this.cleaner) {
            return;
        }
        clearInterval(this.cleaner);
        this.cleaner = null;
    }

    cleanAndDraw() {
        let threshold = Date.now() - this.localDiff - (this.model._get("delay") || 3000);
        this.drawAll(threshold);
    }

    clear() {
        let canvas = this.canvas;
        let ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    drawAll(threshold) {
        if (!this.canvas) {return;}
        let layers = this.model._get("layers");
        if (!layers) {return;}
        this.clear();
        this.drawLayers(layers, threshold);
    }

    drawLayers(layers, threshold) {
        layers.forEach((layer) => {
            layer.forEach((stroke) => {
                this.drawLine(stroke, threshold);
            });
        });
    }

    handleDrawLine(data) {
        this.startCleaner();
        this.localDiff = Date.now() - this.now();
        this.drawLine(data);
    }

    drawLine(data, threshold) {
        let {x0, y0, x1, y1, color, under, time} = data;

        if (threshold !== undefined && time < threshold) {return;}

        let p0 = this.invertPoint(x0, y0);
        let p1 = this.invertPoint(x1, y1);

        let ctx = this.canvas.getContext("2d");
        ctx.globalCompositionOperation = under ? "source-out" : "source-over";
        ctx.lineWidth = 8;
        ctx.lineCap = "round";
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
    }

    pointerDown(evt) {
        if (evt.buttons !== 1) {return;}
        this.setPointerCapture(evt.pointerId);

        let offsetX = evt.offsetX;
        let offsetY = evt.offsetY;
        let p = this.transformPoint(offsetX, offsetY);

        this.lastPoint = p;

        this.addEventListener("pointermove", "pointerMove");
        this.addEventListener("pointerup", "pointerUp");
        this.addEventListener("pointerleave", "pointerUp");
        this.addEventListener("lostpointercapture", "pointerUp");
    }

    pointerMove(evt) {
        if (evt.buttons !== 1) {return;}
        if (this.lastPoint) {
            let x0 = this.lastPoint.x;
            let y0 = this.lastPoint.y;

            let p = this.transformPoint(evt.offsetX, evt.offsetY);

            let userColor = this.getUserColor();
            this.lastPoint = p;
            this.publish(this.model.id, "addLine", {viewId: this.viewId, x0, y0, x1: p.x, y1: p.y, color: userColor});
        }
    }

    pointerUp(_evt) {
        this.lastPoint = null;
        this.releaseAllPointerCapture();
        this.localDeactivate();

        if (this.pad) {
            this.pad.call("TransformView", "annotationDone");
        }
    }

    transformPoint(x, y) {
        if (this.scaler) {
            let zoom = this.scaler.currentZoom;
            let translation = this.scaler.currentTranslation;

            let x0 = (x + translation.x) / zoom;
            let y0 = (y + translation.y) / zoom;
            return {x: x0, y: y0};
        }

        return {x, y};
    }

    invertPoint(x, y) {
        if (this.scaler) {
            let zoom = this.scaler.currentZoom;
            let translation = this.scaler.currentTranslation;

            if (!zoom || !translation) {return [x, y];}

            let x0 = (x * zoom) - translation.x;
            let y0 = (y * zoom) - translation.y;
            return {x: x0, y: y0};
        }

        return {x, y};
    }

    reportPointerMove(evt) {
        if (this.scaler) {
            this.scaler.call("PasteUpView", "pointerMove", evt, true);
        }
    }
}

class MarkerPenIcon {
    marker() {
        return `
<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="25px" height="25px"
         viewBox="0 0 25 25">
<g id="Layer_2">
        <g>
                <path d="M17.95,2.7c1.31,1.3,2.62,2.6,3.92,3.9c0.36,0.36,0.32,0.6-0.13,1.04c-2.46,2.46-4.92,4.92-7.38,7.37
                        c-0.51,0.51-1.03,1-1.51,1.53c-0.33,0.36-0.71,0.53-1.18,0.62c-1.35,0.25-2.69,0.53-4.03,0.8c-0.62,0.12-0.91-0.14-0.79-0.77
                        c0.28-1.46,0.56-2.93,0.87-4.39c0.05-0.22,0.18-0.46,0.34-0.62c3.04-3.06,6.1-6.11,9.15-9.16c0.12-0.12,0.25-0.22,0.38-0.32
                        C17.7,2.7,17.83,2.7,17.95,2.7z M11.49,16.09c-0.92-0.92-1.85-1.85-2.78-2.78c-0.1,0.48-0.15,1.03-0.32,1.54
                        c-0.21,0.61-0.07,1.05,0.45,1.4c0.15,0.1,0.34,0.28,0.48,0.26C10.07,16.39,10.81,16.23,11.49,16.09z"/>
                <path d="M19.78,23.31c-0.12-0.13-0.31-0.23-0.37-0.38c-0.73-1.88-2.22-2.73-4.1-3.1c-1.99-0.39-3.81-0.04-5.47,1.13
                        c-1.08,0.76-2.15,1.56-3.45,1.93c-0.65,0.19-1.31,0.29-1.98,0.13c-1.23-0.28-1.86-1.54-1.33-2.72c0.53-1.18,1.57-1.74,2.74-2.1
                        c0.14-0.04,0.5,0.18,0.53,0.33c0.04,0.19-0.08,0.51-0.24,0.64c-0.3,0.23-0.69,0.31-1.01,0.52c-0.3,0.19-0.59,0.44-0.84,0.7
                        c-0.29,0.3-0.41,0.68-0.21,1.09c0.21,0.43,0.57,0.66,1.03,0.61c0.42-0.05,0.86-0.12,1.23-0.31c0.77-0.39,1.54-0.81,2.24-1.3
                        c1.37-0.95,2.81-1.75,4.5-1.88c2.68-0.2,5.05,0.47,6.73,2.76c0.23,0.31,0.37,0.7,0.55,1.05c0.19,0.36,0.15,0.66-0.2,0.9
                        C20.02,23.31,19.9,23.31,19.78,23.31z"/>
        </g>
</g>
</svg>`;
    }
}

function beDrawing(parent, _json, _persistentData) {
    let canvas = parent.createElement("CanvasElement");
    canvas.domId = "draw-canvas";
    canvas.style.setProperty("border", "1px solid gray");

    let drawing = parent.createElement();
    drawing.setCode("drawing.DrawModel");
    drawing.setViewCode("drawing.DrawView");

    drawing._set("canvasId", "draw-canvas");

    drawing.appendChild(canvas);
    parent.appendChild(drawing);
}

export const drawing = {
    expanders: [DrawModel, DrawView],
    classes: [MarkerPenIcon],
    functions: [beDrawing]
};
