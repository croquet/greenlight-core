# Greenlight Core

## Introduction
Greenlight is a real time collaboration worksspace application. A room of Greenlight is a large 2-dimensional space, where the user can create other collaborative apps, notes, images and other web pages and manipualte them.

Those apps and objects are represented as web browser's DOM elements, so that they can take advantage of browser's features and very lightweight.

The network layer is powered by [Croquet](croquet.io/docs). Croquet's unique technology ensures bit-identical computation on participants browser sessions, thus reduces the network traffic and latency.

Greenlight is built on top of the [Croquet Virtual DOM Framework](croquet.io/docs/virtual-dom). The Virtual DOM Fromework provides a simple abstraction layer to support Croquet's Model-View spearation by storing virtualized DOM property and structure. The framework treats application code as data so that it can be modified at runtime, and Greenlight has a capability to support live programming.

## Code Organization
This repository contains sufficient code and image fiels to run Greenlight. The entire application source code is in the `/src/` directory.

The `/assets/` directory contains icons and bitmaps. Most of those are compiled and assembled into `greenlight.svg`, and referred to with `<use>` element in svg.

If you have an external dashboard implementation, something like the official [Greenlight](croquet.io/greenlight) site, you can use code in `greenlight.js` from the dashboard to invoke Greenlight. A simple example of a mock dashboard is landing.html.

`/text-chat.html`,  `/text-chat.svg` `/src/text-chat.js` and `/src/text-chat.css` are used for the internal text-chat feature.

## Invoking Greenlight

You need four additional files to be downloaded or edited to run Greenlight locally:

1. download croquet.min.js
~~~~ JavaScript
    curl -L -o croquet/croquet.min.js https://unpkg.com/@croquet/croquet@1.0.5
~~~~

2. download croquet-virtual-dom.js
~~~~ JavaScript
    curl -L -o croquet-virtual-dom.js https://unpkg.com/@croquet/virtual-dom@1.0.8
~~~~

3. download widgets.js
~~~~ JavaScript
    curl -L -o widgets.js https://unpkg.com/@croquet/virtual-dom@1.0.8/widgets.js
~~~~

Those files are downloaded to local disk to allow local development described below. Alternatively, you can run `npm install @croquet/croquet` and `npm install @croquet/virtual-dom`, and copy spcified files.

4. edit `apiKey.js`
    Obtain your apiKey from [Croquet Dev Portal](croquet.io/keys) and insert the key into `apiKey.js`:

~~~~ JavaScript
const apiKey = "<put your apiKey from croquet.io/keys>";
export default apiKey;
~~~~

Then, you can simply run it by running the local server with `server.js` and open `localhost:8000/index.html`, or `localhost:8000/landing.html`

## Development and Debugging

As a typical Croquet Virtual DOM application, developing Greenlight does not involve any build or transpilation process. You can just edit the file and reload the page.

You may spend a long time to adjusting CSS or view side event handling. To speed up the iteration, you can add `?isLocal` to the URL (i.e., `localhost:8000/?isLocal`) to skip the actual Croquet network initialization and use an emulated reflector for a single node impelemented in the Virtual DOM Framework. IOW, you can develop the single user aspects of Greenlight totally offline in this way.

As other Virtual DOM apps, setting a breakpoint from the file list in the browser's developer console does not work, as the expanders are stringified and then evaluated at runtime. Either you insert `debugger` statement in code, or choose the VM1234 file shown in console and set a breakpoint.

## Deployment
You don't have to run `npm` to test things out. When you wish to deploy Greenlight with minified code, run `npm install` and run `build-files.sh`. That creates a self-contained directory under `dist`, which you can simply copy to your server.

