let makeMain;
let Library;
let boards;
let minibrowser;
let text;
let widgets;
let apiKey;

let path;

function setPath(string) {
    path = string;
    window._production = path || ".";
}

function loadGreenlight(cleanup, options, moreOptions) {
    let version = path;

    let p0 = new Promise((resolve, _reject) => {
        if (document.querySelector("#croquetSrc")) {
            return resolve();
        }
        let script = document.createElement("script");
        script.id = "croquetSrc";
        script.src = `${version}/croquet/croquet.min.js`;
        script.type = "text/javascript";
        document.body.appendChild(script);
        script.onload = resolve;
        script.onerror = () => {throw new Error("croquet could not be loaded");};
        return script;
    });

    let p1 = new Promise((resolve, _reject) => {
        if (document.querySelector("#pitchStyle")) {
            return resolve();
        }
        let link = document.createElement("link");
        link.id = "pitchStyle";
        link.href = `${version}/src/pitch.css`;
        link.rel = "stylesheet";
        document.head.appendChild(link);
        link.onload = resolve;
        link.onerror = () => {throw new Error("croquet could not be loaded");};
        return link;
    });

    return Promise.all([p0, p1]).then(() => {
        let p2 = import(`${version}/croquet/croquet-virtual-dom.js`).then((mod) => {
            makeMain = mod.makeMain;
            Library = mod.Library;
        });

        let p3 = import(`${version}/src/p.js`).then((mod) => {
            boards = mod.boards;
            minibrowser = mod.minibrowser;
            text = mod.text;
        });

        let p4 = import(`${version}/croquet/widgets.js`).then((mod) => {
            widgets = mod.widgets;
        });

        let p5 = import(`${version}/apiKey.js`).then((mod) => {
            apiKey = mod.default;
        });

        return Promise.all([p2, p3, p4, p5]).then(() => {
            cleanup();
            join(options, moreOptions);
        }).catch((err) => {
            console.error(err);
            throw new Error("croquet could not be loaded");
        });
    });
}

function join(options, moreOptions) {
    let library = new Library();
    library.addLibrary("boards", boards);
    library.addLibrary("widgets", widgets);
    library.addLibrary("minibrowser", minibrowser);
    library.addLibrary("text", text);

    let cSessionName = "boards.p-" + options.sessionName;

    let location = window.location;
    let origin = location.origin;

    let query = new URL(window.location).searchParams;
    query.delete("r");
    query.delete("_");

    if (moreOptions) {
        for (let k in moreOptions) {
            query.append(k, moreOptions[k]);
        }
    }
    let str = query.toString();
    let ampersand = str.length > 0 ? "&" : "";

    let newLocation = `${origin}${location.pathname}?r=${options.sessionName}${ampersand}${str}`;

    window.history.pushState("launch", "Pitch", newLocation);

    window.onpopstate = (_event) => {
        window.location.assign(location);
    };

    let initials = options.initials;
    if (/[^_a-z0-9]/i.test(initials)) {
        let d = () => Math.floor(Math.random() * 10);
        initials = `${d()}${d()}`;
    }

    makeMain("boards.p", {
        autoSleep: false,
        viewIdDebugSuffix: initials,
        tps: 2,
        apiKey,
        appId: "io.croquet.vdom.greenlight",
        eventRateLimit: 60,
    }, library, cSessionName, `${path}/greenlight.svg`, true)();
}

window._setPath = setPath;
window._loadGreenlight = loadGreenlight;
