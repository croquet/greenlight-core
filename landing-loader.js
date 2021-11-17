window.landingLoader = () => {
    import("./landing.js").then((m) => m.load());
}
