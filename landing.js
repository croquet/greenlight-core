/* globals Croquet */

let elements = {};

let audioFeedback = null;
let audioSelection = {
    prev: {deviceId: undefined, label: undefined},
    current: {deviceId: undefined, label: undefined}
};  // begins with undefined for deviceId

let videoSelection = {
    prev: {deviceId: undefined, label: undefined},
    current: {deviceId: undefined, label: undefined}
};  // begins with undefined for deviceId
let audioHistory = [];
let userColor = randomColor();
let lastDevices = [];

let joinButtonPressed = false;

let userInfo = {};
let createdRandomName;

export function load() {
    [
        "panel", "nickname", "title", "mic", "video", "welcome",
        "settings", "settingsMenu", "videoList", "audioList", "videoPreview", "audioPreview",
        "joinButton", "required", "initials", "browserCheck", "streamErrorMessage",
        "defaultWalletname", "walletname"
    ].forEach((n) => {
        let element = document.querySelector("#" + n);
        elements[n] = element;
    });

    ["blur", "keyup", "input", "keydown", "paste", "copy", "cut", "mouseup"].forEach((e) => {
        elements.nickname.addEventListener(e, updateNick);
        elements.walletname.addEventListener(e, updateWallet);
    });

    initButtons();
    initHash();
    checkLocalStorage();
    setNick();
    setWallet();
    setWelcome();
    updateNick();
    updateWallet();

    setResizer();

    initList();
    testInitMedia().then((flag) => {
        if (flag) {
            initMedia();
        }
    });
}

function greenlightLoader(dirPath) {
    return new Promise((resolve, _reject) => {
        if (document.querySelector("#greenlightLoader")) {
            return resolve();
        }
        let script = document.createElement("script");
        script.id = "greenlightLoader";
        script.src = dirPath;
        script.type = "module";
        document.body.appendChild(script);
        script.onload = () => {
            let loadGreenlight = window._loadGreenlight;
            let setPath = window._setPath;
            delete window._loadGreenlight;
            delete window._setPath;
            resolve({loadGreenlight, setPath});
        };
        script.onerror = () => {throw new Error("loader could not be loaded");};
        return script;
    });
}

function findGreenlight() {
    let location = window.location;
    let ind = location.pathname.lastIndexOf("/");
    let dir = location.pathname.slice(0, ind);
    let dirPath;
    dirPath = `${location.origin}${dir}/greenlight.js`;
    return greenlightLoader(dirPath).then((mod) => {
        let dInd = dirPath.lastIndexOf("/");
        let pDir = dirPath.slice(0, dInd);
        mod.setPath(pDir);
        return mod.loadGreenlight;
    });
}

function initButtons() {
    ["mic", "video", "settings"].forEach((n) => {
        let element = elements[n];

        if (n !== "settings") {
            element.onclick = click;
            setButtonState(element, "gray", true);
        } else {
            element.onclick = settingsClick;
            setButtonState(element, "off");
        }
    });
}

function initHash() {
    Croquet.App.autoSession("q").then((sessionName) => {
        elements.title.textContent = sessionName;
    });
}

function checkLocalStorage() {
    if (window.localStorage) {
        try {
            let value = window.localStorage.getItem("userInfo");
            if (!value) {return;}
            value = JSON.parse(value);
            if (value.version !== "2") {return;}
            userInfo = value;
        } catch (e) {
            console.log("error in reading from localStorage");
        }
    }
}

function setNick() {
    let nickname;
    if (userInfo && userInfo.nickname) {
        nickname = userInfo.nickname;
    } else {
        nickname = randomName();
        createdRandomName = nickname;
    }
    elements.nickname.textContent = nickname;
}

function setWallet() {
    let walletname;

    if (userInfo && userInfo.walletname) {
        walletname = userInfo.walletname;
    } else {
        walletname = "public";
    }

    elements.walletname.textContent = walletname;
}

function setWelcome() {
    if (userInfo && userInfo.nickname) {
        elements.welcome.textContent = "Welcome back!";
    }
}

function updateNick(evt) {
    let nickname = elements.nickname;
    if (evt && evt.type === "keyup" && evt.key === "Enter") {
        let text = nickname.textContent;
        text = Array.from(text).filter((c) => c !== "\n" && c !== "\r");
        nickname.textContent = text.join("");

        if (nickname.textContent.length !== 0) {
            join();
            return;
        }
    }

    let joinState = nickname.textContent.length === 0 ? "Inactive" : "Active";

    elements.initials.textContent = initialsFrom(nickname.textContent);
    setState(elements.joinButton, joinState);
}

function updateWallet() {
    if (elements.walletname.textContent.length === 0) {
        elements.defaultWalletname.style.setProperty("display", "inherit");
        elements.walletname.style.setProperty("margin-left", "0px");
    } else {
        elements.defaultWalletname.style.setProperty("display", "none");
        elements.walletname.style.setProperty("margin-left", "8px");
    }
}

function initialsFrom(nickname) {
    if (!nickname) {
        return "";
    }

    let pieces = nickname.split(" ").filter(p => p.length > 0);

    if (pieces.length === 0) {
        return "";
    } if (pieces.length === 1) {
        return pieces[0].slice(0, 2).toUpperCase();
    }

    let name = pieces.map(p => p[0]);
    name = name[0] + name.slice(-1);
    return name.toUpperCase();
}

function testInitMedia() {
    navigator.mediaDevices.ondevicechange = reenumerateDevices;
    return navigator.mediaDevices.getUserMedia({
        video: {
            frameRate : 12,
            aspectRatio: 1.33,
            width: 240,
            height: 240 / 1.33,
            resizeMode: "crop-and-scale",
        },
        audio: true
    }).then((stream) => {
        console.log("stream test succeeeded");
        stream.getTracks().forEach(t => t.stop());
        return true;
    }).catch((err) => {
        console.log("The following error occurred: " + err.name);
        setInput("video", null, false);
        setButtonState(elements.video, "off", true);
        setInput("audio", null, false);
        setButtonState(elements.mic, "off", true);
        updateNick();
        showStreramErrorMessage();
        return false;
    });
}

function initMedia(optType) {
    if (!navigator.mediaDevices.getUserMedia) return;
    if (joinButtonPressed) return;
    let videoPreview = elements.videoPreview;
    enumerateDevices().then(() => {
        if (!optType || optType === "video") {
            if (videoSelection.current.deviceId) {
                navigator.mediaDevices.getUserMedia({
                    video: {
                        deviceId: videoSelection.current.deviceId,
                        frameRate : 12,
                        aspectRatio: 1.33,
                        width: 240,
                        height: 240 / 1.33,
                        resizeMode: "crop-and-scale",
                    },
                    audio: false
                }).then((stream) => {
                    stopVideoPreview();
                    if (joinButtonPressed) {
                        stream.getTracks().forEach(t => t.stop());
                        return true;
                    }
                    videoPreview.srcObject = stream;
                    videoPreview.onloadedmetadata = () => {
                        videoPreview.play();
                        updateNick();
                        setButtonState(elements.video, "on", true);
                    };
                    return false;
                }).catch((err) => {
                    console.log("The following error occurred: " + err.name);
                    setInput("video", null, false);
                    setButtonState(elements.video, "off", true);
                    return false;
                });
            } else {
                stopVideoPreview();
                setButtonState(elements.video, "off", true);
            }
        }

        if (!optType || optType === "audio") {
            if (audioSelection.current.deviceId) {
                navigator.mediaDevices.getUserMedia({
                    audio: {
                        deviceId: audioSelection.current.deviceId,
                    }
                }).then((stream) => {
                    stopAudioFeedback();
                    if (joinButtonPressed) {
                        stream.getTracks().forEach(t => t.stop());
                        return true;
                    }
                    setupAudioFeedback(stream);
                    setButtonState(elements.mic, "on", true);
                    return false;
                }).catch((err) => {
                    console.log("The following error occurred: " + err.name);
                    setInput("audio", null, false);
                    setButtonState(elements.mic, "off", true);
                });
            } else {
                stopAudioFeedback();
                setButtonState(elements.mic, "off", true);
            }
        }
    });
}

function stopVideoPreview() {
    let videoPreview = elements.videoPreview;
    if (videoPreview.srcObject) {
        videoPreview.srcObject.getTracks().forEach(t => t.stop());
    }
    videoPreview.srcObject = null;
    videoPreview.onloadedmetadata = null;
    videoPreview.pause();
}

function initList() {
    elements.audioList.addEventListener("input", (evt) => {
        let index = lookupDeviceInfoIndex(evt.target.value);
        let info = lastDevices[index];
        setInput("audio", info);
        closeSettingsMenu();
    });
    elements.videoList.addEventListener("input", (evt) => {
        let index = lookupDeviceInfoIndex(evt.target.value);
        let info = lastDevices[index];
        setInput("video", info);
        closeSettingsMenu();
    });
}

function lookupDeviceInfoIndex(deviceId) {
    return lastDevices.findIndex((info) => info.deviceId === deviceId);
}

function setInput(type, info, doActivate) {
    let obj;
    if (type === "video") {
        obj = videoSelection;
    } else if (type === "audio") {
        obj = audioSelection;
    }

    if (obj) {
        let changed = false;
        let infoDeviceId = info && info.deviceId;
        let veryFirstTime = obj.current.deviceId === undefined;
        if (!obj.current.deviceId && !doActivate) {
            if (infoDeviceId) {
                obj.prev = {deviceId: info.deviceId, label: info.label};
            }
        } else {
            obj.prev = {deviceId: obj.current.deviceId, label: obj.current.label};
            if (infoDeviceId) {
                obj.current = {deviceId: info.deviceId, label: info.label};
            } else {
                // undefined  is used to denote that we still have not determined
                // even the default device. It happens here when one of camera or mic
                // is blocked so testInitMedia() fails altogether but still
                // clicking on the non-blocked device icon should be possible.
                let val = veryFirstTime ?  undefined : null;
                obj.current = {deviceId: val, label: val};
            }
            changed = true;
        }
        if (changed) {
            initMedia(type);
        }
    }
}

function setupAudioFeedback(stream) {
    if (stream.getAudioTracks().length === 0) {
        console.log("video only stream, perhaps for screen share");
        return;
    }

    let process = (data) => {
        if (!audioFeedback) {
            // already closed;
            return -1;
        }

        let oldTime = audioFeedback.time;
        let nowTime = Date.now();
        if (nowTime < oldTime + 100) {return -1;}
        audioFeedback.time = nowTime;
        let max = 0;
        let buf = data.inputBuffer.getChannelData(0);
        for (let i = 0; i < buf.length; i++) {
            max = Math.max(max, Math.abs(buf[i]));
        }
        max = Math.max((max * 10 - 0.5), 0); // hmm
        return max;
    };

    let context = new (window.AudioContext || window.webkitAudioContext)();
    let cloned = null; //stream.clone();
    let input = context.createMediaStreamSource(stream); // cloned
    let processor = context.createScriptProcessor(1024, 1, 1);
    processor.onaudioprocess = (e) => {
        let v = process(e);
        if (v >= 0) {
            renderAudioFeedback(v);
        }
    };

    input.connect(processor);
    processor.connect(context.destination);

    audioFeedback = {stream, context, input, cloned, processor, time: 0};
}

function renderAudioFeedback(v) {
    audioHistory.push(v);
    if (audioHistory.length > 8) {
        audioHistory.shift();
    }

    let ctx = elements.audioPreview.getContext('2d');
    let width = elements.audioPreview.width;
    let totalHeight = elements.audioPreview.height;
    ctx.clearRect(0, 0, width, totalHeight);
    let step = 6;
    let middleStart = width / 2 - step;
    ctx.fillStyle = "#8c6ce8";
    audioHistory.forEach((vol, i) => {
        let ind = 7 - i;
        let height = Math.min(vol * 20, 30);
        let top = (totalHeight - height) / 2;
        ctx.fillRect(middleStart + (ind * step), top, step, height);
        if (i !== 0) {
            ctx.fillRect(middleStart - (ind * step), top, step, height);
        }
    });
}

function stopAudioFeedback() {
    let audio = audioFeedback;
    if (!audio) {return;}
    if (audio.input) {
        audio.input.disconnect();
    }
    if (audio.processor) {
        audio.processor.disconnect();
    }
    if (audio.context) {
        audio.context.close();
    }
    if (audio.cloned) {
        audio.cloned.getTracks().forEach(track => track.stop());
    }

    if (audio.stream) {
        audio.stream.getTracks().forEach(track => track.stop());
    }
    let ctx = elements.audioPreview.getContext('2d');
    let width = elements.audioPreview.width;
    let totalHeight = elements.audioPreview.height;
    ctx.clearRect(0, 0, width, totalHeight);

    audioFeedback = null;
}

function resizer() {
    if (window.innerWidth >= 512 && window.innerHeight >= 720) {
        elements.panel.style.removeProperty("transform");
        return;
    }

    let ratio = Math.min(window.innerWidth / 512, window.innerHeight / 720) * 0.9;

    elements.panel.style.setProperty("transform", `scale(${ratio})`);
    elements.panel.style.setProperty("transform-origin", `top left`);
}

function setResizer() {
    window.addEventListener("resize", resizer);
    resizer();
}

function click(evt) {
    let button = evt.target;
    let state = button.getAttribute("state");
    let newState = state === "on" ? "off" : "on";
    setButtonState(button, newState, true);
    let doActivate = newState === "on";
    if (button.id === "mic") {
        setInput("audio", doActivate ? audioSelection.prev : null, doActivate);
    }
    if (button.id === "video") {
        setInput("video", doActivate ? videoSelection.prev : null, doActivate);
    }
}

function settingsClick() {
    let settingsOpened = elements.settingsMenu.getAttribute("state") === "shown";
    if (settingsOpened) {
        closeSettingsMenu();
    } else {
        openSettingsMenu();
    }
}

function enumerateDevices() {
    return new Promise((resolve) => {
        navigator.mediaDevices.enumerateDevices().then((ary) => {
            lastDevices = ary;
            let audio = [];
            let video = [];
            ary.forEach((device) => {
                let {deviceId, kind, label} = device;
                if (deviceId === "default") {
                    // console.log(`rejecting "default" device (${label})`);
                    return;
                }
                let list;
                let info;
                if (kind === "videoinput") {
                    list = video;
                    info = videoSelection;
                } else if (kind === "audioinput") {
                    list = audio;
                    info = audioSelection;
                }
                if (!info) {return;}
                if (info.current.deviceId === undefined) {
                    // really for the very first time
                    info.current = {deviceId, label};
                }
                let selected = false;
                if (info.current.deviceId) {
                    selected = info.current.deviceId === deviceId;
                } else if (info.prev.deviceId) {
                    selected = info.prev.deviceId === deviceId;
                }
                list.push({deviceId, selected, label});
            });
            resolve({video, audio});
        });
    });
}

function reenumerateDevices() {
    let isOpened = elements.settingsMenu.getAttribute("state") === "shown";
    if (isOpened) {
        openSettingsMenu();
    }
}

function openSettingsMenu() {
    elements.settingsMenu.setAttribute("state", "shown");

    let rect = elements.settings.getBoundingClientRect();
    let sRect = elements.settingsMenu.getBoundingClientRect();
    elements.settingsMenu.style.setProperty("left", (rect.right - sRect.width - 20) + "px");
    elements.settingsMenu.style.setProperty("top", (rect.y + 44) + "px");

    enumerateDevices().then((info) => {
        setList(info.audio, elements.audioList);
        setList(info.video, elements.videoList);
    });
}

function setList(list, elem) {
    while (elem.lastChild) {
        elem.lastChild.remove();
    }
    list.forEach((device) => {
        let {deviceId, selected, label} = device;
        let option = new Option(label, deviceId, selected, selected);
        elem.appendChild(option);
    });
}

function closeSettingsMenu() {
    elements.settingsMenu.removeAttribute("state");
}

function setButtonState(button, state, isLarge) {
    let newIcon = `img-${button.id}-${state}`;
    let newBack = "transparent";

    button.setAttribute("state", state);
    button.style.setProperty("background", newBack);

    let viewBox = isLarge ? `viewBox="0 0 40 40"` : `viewBox="0 0 24 24"`;
    let html = `<svg class="icon" ${viewBox}><use href="#${newIcon}"></use></svg>`;
    button.innerHTML = html;
}

function setState(button, state) {
    if (state === "Inactive") {
        button.onclick = null;
    } else {
        button.onclick = join;
    }
    button.setAttribute("state", state);
}

function showStreramErrorMessage() {
    elements.streamErrorMessage.style.setProperty("visibility", "inherit");
}

function join() {
    joinButtonPressed = true;
    console.log(
        "pressed",
        elements.mic.getAttribute("state"),
        elements.video.getAttribute("state"),
        elements.nickname.textContent,
        elements.initials.textContent,
        elements.walletname.textContent || "public");

    stopVideoPreview();
    stopAudioFeedback();
    closeSettingsMenu();

    ["#landing-svg", "#landing-background", "#landing-style"].forEach(n => {
        let elem = document.querySelector(n);
        if (elem) {
            elem.remove();
        }
    });

    let root = document.querySelector("#croquet-root");
    if (root) {
        root.style.setProperty("display", "inherit");
    }

    let nickname = elements.nickname.textContent;
    let walletname = elements.walletname.textContent || "public";
    let mic = elements.mic.getAttribute("state");
    let video = elements.video.getAttribute("state");
    let initials = elements.initials.textContent;
    let sessionName = elements.title.textContent;
    let cameraDeviceId = videoSelection.current.deviceId;
    let cameraDeviceLabel = videoSelection.current.label;
    let cameraDeviceIndex = lookupDeviceInfoIndex(videoSelection.current.deviceId);

    let micDeviceId = audioSelection.current.deviceId;
    let micDeviceLabel = audioSelection.current.label;
    let micDeviceIndex = lookupDeviceInfoIndex(audioSelection.current.deviceId);

    let options = {
        nickname, walletname, initials, userColor, sessionName,
        mic, video,
        cameraDeviceId, cameraDeviceLabel, cameraDeviceIndex,
        micDeviceId, micDeviceLabel, micDeviceIndex,
        boardName: sessionName
    };

    if (createdRandomName !== options.nickname) {
        let store = {version: "2", ...options};
        if (window.localStorage) {
            try {
                window.localStorage.setItem("userInfo", JSON.stringify(store));
            } catch (e) {
                console.log("error in writing to localStorage");
            }
        }
    }

    window.fromLandingPage = options;

    delete window.landingLoader;
    let script = document.getElementById("landingLoader");
    if (script) {script.remove();}

    findGreenlight().then((loadGreenlight) => {
        loadGreenlight(() => {
            window.document.title = `G: ${sessionName || ""}`;
            window.fromLandingPage = options;
        }, options, null);
    });
}

function randomColor() {
    let h = Math.random() * 360;
    let s = "40%";
    let l = "40%";
    return `hsl(${h}, ${s}, ${l})`;
}

function randomName() {
    let left = [
        "Admiring", "Adoring", "Affectionate", "Agitated", "Amazing", "Angry",
        "Awesome", "Beautiful", "Blissful", "Bold", "Boring", "Brave", "Busy",
        "Charming", "Clever", "Cool", "Compassionate", "Competent", "Condescending",
        "Confident", "Cranky", "Crazy", "Dazzling", "Determined", "Distracted",
        "Dreamy", "Eager", "Ecstatic", "Elastic", "Elated", "Elegant", "Eloquent",
        "Epic", "Exciting", "Fervent", "Festive", "Flamboyant", "Focused", "Friendly",
        "Frosty", "Funny", "Gallant", "Gifted", "Goofy", "Gracious", "Great", "Happy",
        "Hardcore", "Heuristic", "Hopeful", "Hungry", "Infallible", "Inspiring",
        "Interesting", "Intelligent", "Jolly", "Jovial", "Keen", "Kind", "Laughing",
        "Loving", "Lucid", "Magical", "Mystifying", "Modest", "Musing", "Naughty",
        "Nervous", "Nice", "Nifty", "Nostalgic", "Objective", "Optimistic", "Peaceful",
        "Pedantic", "Pensive", "Practical", "Priceless", "Quirky", "Quizzical",
        "Recursing", "Relaxed", "Reverent", "Romantic", "Sad", "Serene", "Sharp",
        "Silly", "Sleepy", "Stoic", "Strange", "Stupefied", "Suspicious", "Sweet",
        "Tender", "Thirsty", "Trusting", "Unruffled", "Upbeat", "Vibrant", "Vigilant",
        "Vigorous", "Wizardly", "Wonderful", "Xenodochial", "Youthful", "Zealous",
        "Zen"
    ];

    let right = [
        "Acorn", "Allspice", "Almond", "Ancho", "Anise", "Aoli", "Apple",
        "Apricot","Arrowroot","Asparagus","Avocado","Baklava","Balsamic",
        "Banana", "Barbecue", "Bacon", "Basil", "Bay Leaf", "Bergamot", "Blackberry",
        "Blueberry","Broccoli", "Buttermilk", "Cabbage", "Camphor", "Canaloupe",
        "Cappuccino", "Caramel", "Caraway", "Cardamom", "Catnip", "Cauliflower",
        "Cayenne", "Celery", "Cherry", "Chervil", "Chives", "Chipotle", "Chocolate",
        "Coconut", "Cookie Dough", "Chicory", "Chutney", "Cilantro", "Cinnamon",
        "Clove", "Coriander", "Cranberry", "Croissant", "Cucumber", "Cupcake", "Cumin",
        "Curry", "Dandelion", "Dill", "Durian", "Eclair", "Eggplant", "Espresso",
        "Felafel","Fennel", "Fenugreek", "Fig", "Garlic", "Gelato", "Gumbo",
        "Honeydew", "Hyssop", "Ghost Pepper",
        "Ginger", "Ginseng", "Grapefruit", "Habanero", "Harissa", "Hazelnut",
        "Horseradish", "Jalepeno", "Juniper", "Ketchup", "Key Lime", "Kiwi",
        "Kohlrabi", "Kumquat", "Latte", "Lavender", "Lemon Grass", "Lemon Zest",
        "Licorice", "Macaron", "Mango", "Maple Syrup", "Marjoram", "Marshmallow",
        "Matcha", "Mayonnaise", "Mint", "Mulberry", "Mustard", "Nectarine", "Nutmeg",
        "Olive Oil", "Orange Peel", "Oregano", "Papaya", "Paprika", "Parsley",
        "Parsnip", "Peach", "Peanut", "Pecan", "Pennyroyal", "Peppercorn", "Persimmon",
        "Pineapple", "Pistachio", "Plum", "Pomegranate", "Poppy Seed", "Pumpkin",
        "Quince", "Ragout", "Raspberry", "Ratatouille", "Rosemary", "Rosewater",
        "Saffron", "Sage", "Sassafras", "Sea Salt", "Sesame Seed", "Shiitake",
        "Sorrel", "Soy Sauce", "Spearmint", "Strawberry", "Strudel", "Sunflower Seed",
        "Sriracha", "Tabasco", "Tamarind", "Tandoori", "Tangerine", "Tarragon",
        "Thyme", "Tofu", "Truffle", "Tumeric", "Valerian", "Vanilla", "Vinegar",
        "Wasabi", "Walnut", "Watercress", "Watermelon", "Wheatgrass", "Yarrow",
        "Yuzu", "Zucchini"
    ];

    let a = left[Math.floor(Math.random() * left.length)];
    let b = right[Math.floor(Math.random() * right.length)];
    return `${a} ${b}`;
}
