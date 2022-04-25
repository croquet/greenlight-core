# Greenlight Core

## Introduction

Greenlight is a real time collaboration workspace application. A room in Greenlight is a large two-dimensional space where users can create many collaborative apps, notes, images and web pages and manipulate them.

<p align="center">
<img src="https://gist.githubusercontent.com/yoshikiohshima/6644ea9a84561d6f8ec365003a9ce22a/raw/0a97b8893e3549c4f8086af1a52413dcc16eb111/greenlght.png" width="600"/>
</p>

Those apps and objects are visualized with browser's DOM elements, sometimes in `iframes`, so that they can take advantage of the browser's features while keeping the Greenlight core lightweight.

Its network layer is powered by [Croquet](https://croquet.io). Croquet's unique technology ensures bit-identical computation in each participants' local browser, reducing network traffic and latency.

Greenlight is built on top of the [Croquet Virtual DOM Framework](https://croquet.io/docs/virtual-dom). The Virtual DOM Framework provides a simple abstraction layer to support Croquet's Model-View separation by storing virtualized DOM property and structure. The framework treats application code as data so that it can be modified at runtime, which enables Greenlight to have the capability to support live programming. The production installation of Greenlight is available at [https://croquet.io/greenlight](https://croquet.io/greenlight). 

This repository provides the code of core Greenlight used for the production, its purpose is to provide code samples of a large and flexible working Croquet application. While all core features are provided, some apps in the tool bar may not be started as they are restricted to only run from the `croquet.io` domain.  If you open an app and see the image below, it means the app is restricted.

<p align="center">
<img src="https://gist.githubusercontent.com/yoshikiohshima/6644ea9a84561d6f8ec365003a9ce22a/raw/065f72dd015ebb8b10390ffefd72d1bee2c958e6/sad.png" width="200"/>
</p>

You are very welcome to change the list of apps in the tool bar and make your own, or make it so that you can customize the tool bar for each room.

## Code Organization

This repository contains code and images files to run Greenlight. The entire application source code is in the `/src/` directory.

The `/assets/` directory contains icons and bitmaps. Most of those svg files are fed through [SVG sprite generator](https://svgsprite.com/tools/svg-sprite-generator/) and compiled into `greenlight.svg`. Individual icons are referred to with the `<use>` element from application code.

If you create an external dashboard, something like the production [Greenlight](https://croquet.io/greenlight), you can use code in `greenlight.js`. to invoke Greenlight with additional information. A simple example of a mock dashboard is provided at: [landing.html](https://github.com/croquet/greenlight-core/blob/main/landing.html).

`/text-chat.html`, `/text-chat.svg` `/src/text-chat.js` and `/src/text-chat.css` are used for the internal text-chat feature.  In other words, the text chat of Greenlight is its own Croquet application.

## Invoking Greenlight

While running Greenlight does not require Node or Npm; having them installed on your computer in general helps.

First, you need to copy or install three library files. If you already have Node.js and Npm installed, you can run:

   ```bash
   npm run setup
   ```

to download following three files. If your system does not have curl, you can open the unpkg URLs specified below in a web browser, and save the js files under the specified names.

If you don't have npm, manually copy three files.

1. Download croquet.min.js

   ```bash
   curl -L -o croquet/croquet.min.js https://unpkg.com/@croquet/croquet
   ```

2. Download croquet-virtual-dom.js

   ```bash
   curl -L -o croquet/croquet-virtual-dom.js https://unpkg.com/@croquet/virtual-dom
   ```

3. Download widgets.js

   ```bash
   curl -L -o croquet/widgets.js https://unpkg.com/@croquet/virtual-dom/widgets.js
   ```

Those files are downloaded to your local disk to allow local development described below.

4. Add your Croquet API key to `apiKey.js`
   Obtain your apiKey from [Croquet Dev Portal](croquet.io/keys), create `apiKey.js` by copying `apiKey.js-example` to `apiKey.js`, and insert the key into it.

   ```JavaScript
   const apiKey = "<insert your apiKey from croquet.io/keys>";
   export default apiKey;
   ```

5. If you have node installed you can use the simple server implementation:

   ```Bash
   node server.js
   ```

Otherwise, use your own server for local development, or upload the directory to a server. 

6. Open `localhost:8000/index.html`. Note that Greenlight implementation depends on native ES6 modules, and cannot be run via the `file:` URL scheme. 

## Development and Debugging

Developing Greenlight does not involve any build or transpilation process. Just edit the file and reload the page. All Croquet Virtual DOM applications work this way.

Adjusting CSS or view side event handling can involve a lot of iterative development. To speed up browser reloads, you can add `?isLocal` to the URL (i.e., `localhost:8000/?isLocal`) to skip the actual Croquet network initialization. This flag uses an emulated reflector for a single node impelemented in the Virtual DOM Framework. In other words, you can develop the "single user" aspects of Greenlight totally offline in this way.

### Debugging

You can set a breakpoint in code to see what the application is doing. You can certainly insert the `debugger` statement in a JS file. Note, however, that the expander code (most of .js files in the `/src/` directory) are stringified and then evaluated at runtime. It means that the file you navigate to from the Sources tab of the Chrome Development Tool is not the actual code that the browser is running. If you would like to set a break point in a running code, see the source file display in the console:

<p align="center">
<img src="https://gist.githubusercontent.com/yoshikiohshima/6644ea9a84561d6f8ec365003a9ce22a/raw/de5c60ff73262b99ba366d32ca440aa46fb2d1f5/debug.png" width="300"/>
</p>

where in this example showing file as `VM197`, `VM348`, etc. and click on it. Then the expander code that produced the console log can be accessed, and you can insert a break point.

## Deployment

When you are ready to deploy Greenlight and you wish to minify code, run:

```JavaScript
npm install
```

and then:

```Bash
./build-files.sh
```

This creates a self-contained directory under `/dist/`, which you can simply copy to your server.
