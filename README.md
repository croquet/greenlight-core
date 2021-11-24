# Greenlight Core

## Introduction

Greenlight is a real time collaboration workspace application. A room in Greenlight is a large 2-dimensional space where the user can create other collaborative apps, notes, images and other web pages and manipualte them.

Those apps and objects are represented as browser DOM elements, so that they can take advantage of the browser's features while remaining lightweight.

The network layer is powered by [Croquet](croquet.io/docs). Croquet's unique technology ensures bit-identical computation in each participants' local browser, reducing network traffic and latency.

Greenlight is built on top of the [Croquet Virtual DOM Framework](croquet.io/docs/virtual-dom). The Virtual DOM Fromework provides a simple abstraction layer to support Croquet's Model-View spearation by storing virtualized DOM property and structure. The framework treats application code as data so that it can be modified at runtime, and Greenlight has the capability to support live programming.

## Code Organization

This repository contains the code and images files to run Greenlight. The entire application source code is in the `/src/` directory.

The `/assets/` directory contains icons and bitmaps. Most of those are compiled and assembled into `greenlight.svg`, and referred to with `<use>` element in svg.

If you have an external dashboard implementation, something like the official [Greenlight](croquet.io/greenlight) site, you can use code in `greenlight.js` from the dashboard to invoke Greenlight. A simple example of a mock dashboard is `[landing.html](https://github.com/croquet/greenlight-core/blob/main/landing.html)`.

`/text-chat.html`, `/text-chat.svg` `/src/text-chat.js` and `/src/text-chat.css` are used for the internal text-chat feature.

## Invoking Greenlight

In order to run Greenlight locally:

1. Download croquet.min.js

   ```bash
   curl -L -o croquet/croquet.min.js https://unpkg.com/@croquet/croquet@1.0.5
   ```

2. Download croquet-virtual-dom.js

   ```bash
   curl -L -o croquet-virtual-dom.js https://unpkg.com/@croquet/virtual-dom@1.0.8
   ```

3. Download widgets.js

   ```bash
   curl -L -o widgets.js https://unpkg.com/@croquet/virtual-dom@1.0.8/widgets.js
   ```

   Those files are downloaded to local disk to allow local development described below.

   Alternatively, you can run `npm install @croquet/croquet` and `npm install @croquet/virtual-dom`, and copy spcified files.

4. Add your Croquet API key to `apiKey.js`
   Obtain your apiKey from [Croquet Dev Portal](croquet.io/keys) and insert the key into `apiKey.js`:

   ```JavaScript
   const apiKey = "<put your apiKey from croquet.io/keys>";
   export default apiKey;
   ```

5. Then run the server:

   ```Bash
   node server.js
   ```

6. And open `localhost:8000/index.html`.

## Development and Debugging

Developing Greenlight does not involve any build or transpilation process. Just edit the file and reload the page. All Croquet Virtual DOM applications work this way.

Adjusting CSS or view side event handling can involve a lot of iterative development. To speed up browser reloads, you can add `?isLocal` to the URL (i.e., `localhost:8000/?isLocal`) to skip the actual Croquet network initialization. This flag uses an emulated reflector for a single node impelemented in the Virtual DOM Framework. In other words, you can develop the "single user" aspects of Greenlight totally offline in this way.

### Debugging

Setting a breakpoint from the file list in the browser's developer console does not work, as the expanders are stringified and then evaluated at runtime. Either insert `debugger` statement in code, or choose the VM1234 file shown in console and set a breakpoint.

## Deployment

You don't have to run `npm` to test things out. When you're ready to deploy Greenlight with minified code, run:

```JavaScript
npm install
```

and then

```Bash
./build-files.sh
```

That creates a self-contained directory under `dist` which you can simply copy to your server.
