// The definition of these functions are in the IIFE. 
// The point is to keep a clean global scope. 
// Only these functions will be accessible globaly. 
let better_inpaint_update_all;


(() => {
    const BETTER_INPAINT_POLLING_TIMEOUT = 500;


    document.addEventListener("DOMContentLoaded", () => {
        onBetterInpaintTabLoaded(() => setupBetterInpaintRoot(
            getBetterInpaintRoot(), 
            getElementsToHide(),
        ));
    });


    function onBetterInpaintTabLoaded(callback) {
        const inpaintRoot = getBetterInpaintRoot();
        if (inpaintRoot === null) {
            setTimeout(() => { onBetterInpaintTabLoaded(callback); }, BETTER_INPAINT_POLLING_TIMEOUT);
            return;
        }
        callback();
    }


    function getBetterInpaintRoot() {
        return document.querySelector("#img2img_better_inpaint_root");
    }


    function getElementsToHide() {
        try {
            return [
                document.querySelector("#img2img_inpaint_full_res").parentElement.parentElement.parentElement,
                // document.querySelector("#img2img_better_inpaint_image").parentElement,
            ];
        }
        catch {
            return [null];
        }
    }


    function setupBetterInpaintRoot(root, elementsToHide) {
        populateRoot(root);
        hideRedundantComponents(root, elementsToHide);
    }

    
    function populateRoot(root) {
        const betterInpaint = new BetterInpaintElement();
        root.appendChild(betterInpaint);
    }


    function hideRedundantComponents(root, elementsToHide) {
        const callback = function(mutationsList, _) {
            for(const mutation of mutationsList) {
                if (mutation.type === "attributes" && mutation.attributeName === "style") {
                    const display = window.getComputedStyle(mutation.target).display;
                    elementsToHide.forEach(nodeToHide => {
                        if(display == "block") {
                            nodeToHide.classList.add("better-inpaint-hidden");
                        }
                        else {
                            nodeToHide.classList.remove("better-inpaint-hidden");
                        }
                    });
                }
            }
        };
        const observer = new MutationObserver(callback);
        const targetNode = root.parentElement.parentElement;
        const config = { attributes: true, attributeFilter: ["style"] };
        observer.observe(targetNode, config);
    }


    class BetterInpaintElement extends HTMLElement {
        constructor() {
            super();
            this.handleWheel = this.handleWheel.bind(this);
        }
        
        connectedCallback() {
            this.container = document.createElement("div");
            this.appendChild(this.container);
            this.container.style.position = "relative";
            this.container.style.overflow = "hidden";
            this.container.style.height = "800px";
            this.container.addEventListener("wheel", this.handleWheel);

            this.viewport = new ViewportElement();
            this.container.appendChild(this.viewport);
            this.viewport.style.width = "100%";
            this.viewport.style.height = "100%";
            this.viewport.style.position = "absolute";

            this.image_upload_observer = watch_gradio_image("#img2img_better_inpaint_image_upload", src => {
                const image = this.viewport.image.image;
                const maskCanvas = this.viewport.mask.maskCanvas;
                const selection = this.viewport.selection;

                image.src = src;
                const updateFunction = () => {
                    maskCanvas.width = image.naturalWidth;
                    maskCanvas.height = image.naturalHeight;
                    const containerClientRect = this.container.getBoundingClientRect();
                    selection.style.height = `${100 * ((image.naturalHeight / image.naturalWidth) * containerClientRect.width) / containerClientRect.height}%`;
                    compute_cropped_images();
                };
                image.onload = updateFunction;
                if(src === "") updateFunction();
            });

            console.log("[sd-webui-better-inpaint] Root component created");
        }

        disconnectedCallback() {
            if(this.container) {
                this.container.removeEventListener("wheel", this.handleWheel);
            }
            if(this.image_upload_observer) {
                this.image_upload_observer.disconnect();
            }
        }

        handleWheel(event) {
            event.preventDefault();
            const scrollAmount = event.deltaY > 0 ? 1 : -1;
            const clientRect = this.container.getBoundingClientRect();
            const mouseX = 100 * (event.clientX - clientRect.left) / clientRect.width;
            const mouseY = 100 * (event.clientY - clientRect.top) / clientRect.height;
            const [cursorOffsetX, cursorOffsetY] = [
                mouseX - this.viewport.offset[0],
                mouseY - this.viewport.offset[1],
            ];
            const previousScale = this.viewport.scale;
            if(scrollAmount < 0) {
                this.viewport.scale *= 1.1;
            }
            if(scrollAmount > 0) {
                this.viewport.scale /= 1.1;
            }
            const actualScaleApplied = this.viewport.scale / previousScale;
            this.viewport.offset = [
                this.viewport.offset[0] + cursorOffsetX * (1 - actualScaleApplied),
                this.viewport.offset[1] + cursorOffsetY * (1 - actualScaleApplied),
            ]
        }
    }


    class ViewportElement extends HTMLElement {
        constructor() {
            super();
            this._scale = 100;
            this._offset = [0, 0];
        }
        
        connectedCallback() {
            this.image = new ViewportImageElement();
            this.appendChild(this.image);
            this.image.style.position = "absolute";
            this.image.style.width = "100%";

            this.mask = new ViewportMaskElement();
            this.appendChild(this.mask);
            this.mask.style.position = "absolute";
            this.mask.style.width = "100%";

            this.selection = new SelectionRectangleElement(this.image);
            this.appendChild(this.selection);
            this.selection.style.position = "absolute";
            this.selection.style.width = "100%";
        }

        disconnectedCallback() {

        }
        
        get scale() {
            return this._scale;
        }

        set scale(value) {
            if(value > 2000) return;
            if(value < 20) return;

            this._scale = value;
            this.style.width = `${value}%`;
            this.style.height = `${value}%`;
        }

        get offset() {
            return this._offset;
        }

        set offset(value) {
            if(value[0] > 80) value[0] = 80;
            if(value[0] < 20 - this.scale) value[0] = 20 - this.scale;
            if(value[1] > 80) value[1] = 80;
            if(value[1] < 20 - this.scale) value[1] = 20 - this.scale;

            this._offset = value;
            this.style.left = `${value[0]}%`;
            this.style.top = `${value[1]}%`;
        }
    }


    class ViewportImageElement extends HTMLElement {
        constructor() {
            super();
        }

        connectedCallback() {
            this.image = document.createElement("img");
            this.appendChild(this.image);
            this.image.setAttribute("data-type", "full");
            this.image.style.position = "absolute";
            this.image.style.width = "100%";

            this.croppedImage = document.createElement("img");
            this.appendChild(this.croppedImage);
            this.croppedImage.setAttribute("data-type", "cropped");
            this.croppedImage.style.display = "none";
        }

        disconnectedCallback() {

        }
    }


    class ViewportMaskElement extends HTMLElement {
        constructor() {
            super();
        }

        connectedCallback() {
            this.maskCanvas = document.createElement("canvas");
            this.appendChild(this.maskCanvas);
            this.maskCanvas.style.width = "100%";

            this.maskRGBA = document.createElement("img");
            this.appendChild(this.maskRGBA);
            this.maskRGBA.setAttribute("data-type", "RGBA");
            this.maskRGBA.style.display = "none";

            this.maskL = document.createElement("img");
            this.appendChild(this.maskL);
            this.maskL.setAttribute("data-type", "L");
            this.maskL.style.display = "none";
        }

        disconnectedCallback() {
            this.image_upload_observer.disconnect();
        }
    }


    class SelectionRectangleElement extends HTMLElement {
        constructor(imageContainer) {
            super();
            this.imageContainer = imageContainer;
        }

        connectedCallback() {
            this.selectionRect = document.createElement("div");
            this.appendChild(this.selectionRect);
            this.selectionRect.style.position = "absolute";
            this.selectionRect.style.backgroundColor = "rgba(255, 255, 255, 0.5)";
            this.selectionRect.style.left = "20%";
            this.selectionRect.style.top = "20%";
            this.selectionRect.style.width = "30%";
            this.selectionRect.style.height = "30%";

            this.resizeLeft = document.createElement("div");
            this.selectionRect.append(this.resizeLeft);
            this.resizeLeft.style.position = "absolute";
            this.resizeLeft.style.cursor = "ew-resize";
            this.resizeLeft.style.width = "10px";
            this.resizeLeft.style.height = "100%";
            this.resizeLeft.style.left = "-5px";
            this.resizeLeft.style.top = "0px";
            this.resizeLeft.previousStyle = JSON.parse(JSON.stringify(this.resizeLeft.style));
            this.resizeLeft.updateFunction = (deltaX, deltaY) => {
                const initialValue = parseFloat(this.selectionRect.previousStyle.left.replace("%", ""));
                deltaX = clamp(deltaX + initialValue, 0, 100) - initialValue;
                this.selectionRect.style.left = `${initialValue + deltaX}%`;
                this.resizeWidth.updateFunction(-deltaX, -deltaY);
            };

            this.resizeTop = document.createElement("div");
            this.selectionRect.append(this.resizeTop);
            this.resizeTop.style.position = "absolute";
            this.resizeTop.style.cursor = "ns-resize";
            this.resizeTop.style.width = "100%";
            this.resizeTop.style.height = "10px";
            this.resizeTop.style.left = "0px";
            this.resizeTop.style.top = "-5px";
            this.resizeTop.previousStyle = JSON.parse(JSON.stringify(this.resizeTop.style));
            this.resizeTop.updateFunction = (deltaX, deltaY) => {
                const initialValue = parseFloat(this.selectionRect.previousStyle.top.replace("%", ""));
                deltaY = clamp(deltaY + initialValue, 0, 100) - initialValue;
                this.selectionRect.style.top = `${initialValue + deltaY}%`;
                this.resizeHeight.updateFunction(-deltaX, -deltaY);
            };

            this.resizeWidth = document.createElement("div");
            this.selectionRect.append(this.resizeWidth);
            this.resizeWidth.style.position = "absolute";
            this.resizeWidth.style.cursor = "ew-resize";
            this.resizeWidth.style.width = "10px";
            this.resizeWidth.style.height = "100%";
            this.resizeWidth.style.left = "calc(100% - 5px)";
            this.resizeWidth.style.top = "0px";
            this.resizeWidth.previousStyle = JSON.parse(JSON.stringify(this.resizeWidth.style));
            this.resizeWidth.updateFunction = (deltaX, deltaY) => {
                const leftValue = parseFloat(this.selectionRect.style.left.replace("%", ""));
                const initialValue = parseFloat(this.selectionRect.previousStyle.width.replace("%", ""));
                deltaX = clamp(leftValue + initialValue + deltaX, 0, 100) - (leftValue + initialValue);
                this.selectionRect.style.width = `${initialValue + deltaX}%`;
            };

            this.resizeHeight = document.createElement("div");
            this.selectionRect.append(this.resizeHeight);
            this.resizeHeight.style.position = "absolute";
            this.resizeHeight.style.cursor = "ns-resize";
            this.resizeHeight.style.width = "100%";
            this.resizeHeight.style.height = "10px";
            this.resizeHeight.style.left = "0px";
            this.resizeHeight.style.top = "calc(100% - 5px)";
            this.resizeHeight.previousStyle = JSON.parse(JSON.stringify(this.resizeHeight.style));
            this.resizeHeight.updateFunction = (deltaX, deltaY) => {
                const topValue = parseFloat(this.selectionRect.style.top.replace("%", ""));
                const initialValue = parseFloat(this.selectionRect.previousStyle.height.replace("%", ""));
                deltaY = clamp(topValue + initialValue + deltaY, 0, 100) - (topValue + initialValue);
                this.selectionRect.style.height = `${initialValue + deltaY}%`;
            };

            this.resizeUpperLeft = document.createElement("div");
            this.selectionRect.append(this.resizeUpperLeft);
            this.resizeUpperLeft.style.position = "absolute";
            this.resizeUpperLeft.style.cursor = "nwse-resize";
            this.resizeUpperLeft.style.width = "10px";
            this.resizeUpperLeft.style.height = "10px";
            this.resizeUpperLeft.style.left = "-5px";
            this.resizeUpperLeft.style.top = "-5px";
            this.resizeUpperLeft.previousStyle = JSON.parse(JSON.stringify(this.resizeUpperLeft.style));
            this.resizeUpperLeft.updateFunction = (deltaX, deltaY) => {
                this.resizeLeft.updateFunction(deltaX, deltaY);
                this.resizeTop.updateFunction(deltaX, deltaY);
            };

            this.resizeUpperRight = document.createElement("div");
            this.selectionRect.append(this.resizeUpperRight);
            this.resizeUpperRight.style.position = "absolute";
            this.resizeUpperRight.style.cursor = "nesw-resize";
            this.resizeUpperRight.style.width = "10px";
            this.resizeUpperRight.style.height = "10px";
            this.resizeUpperRight.style.left = "calc(100% - 5px)";
            this.resizeUpperRight.style.top = "-5px";
            this.resizeUpperRight.previousStyle = JSON.parse(JSON.stringify(this.resizeUpperRight.style));
            this.resizeUpperRight.updateFunction = (deltaX, deltaY) => {
                this.resizeWidth.updateFunction(deltaX, deltaY);
                this.resizeTop.updateFunction(deltaX, deltaY);
            };

            this.resizeLowerRight = document.createElement("div");
            this.selectionRect.append(this.resizeLowerRight);
            this.resizeLowerRight.style.position = "absolute";
            this.resizeLowerRight.style.cursor = "nwse-resize";
            this.resizeLowerRight.style.width = "10px";
            this.resizeLowerRight.style.height = "10px";
            this.resizeLowerRight.style.left = "calc(100% - 5px)";
            this.resizeLowerRight.style.top = "calc(100% - 5px)";
            this.resizeLowerRight.previousStyle = JSON.parse(JSON.stringify(this.resizeLowerRight.style));
            this.resizeLowerRight.updateFunction = (deltaX, deltaY) => {
                this.resizeWidth.updateFunction(deltaX, deltaY);
                this.resizeHeight.updateFunction(deltaX, deltaY);
            };

            this.resizeLowerLeft = document.createElement("div");
            this.selectionRect.append(this.resizeLowerLeft);
            this.resizeLowerLeft.style.position = "absolute";
            this.resizeLowerLeft.style.cursor = "nesw-resize";
            this.resizeLowerLeft.style.width = "10px";
            this.resizeLowerLeft.style.height = "10px";
            this.resizeLowerLeft.style.left = "-5px";
            this.resizeLowerLeft.style.top = "calc(100% - 5px)";
            this.resizeLowerLeft.previousStyle = JSON.parse(JSON.stringify(this.resizeLowerLeft.style));
            this.resizeLowerLeft.updateFunction = (deltaX, deltaY) => {
                this.resizeLeft.updateFunction(deltaX, deltaY);
                this.resizeHeight.updateFunction(deltaX, deltaY);
            };

            this.moveBlock = document.createElement("div");
            this.selectionRect.append(this.moveBlock);
            this.moveBlock.style.position = "absolute";
            this.moveBlock.style.cursor = "move";
            this.moveBlock.style.width = "calc(100% - 10px)";
            this.moveBlock.style.height = "calc(100% - 10px)";
            this.moveBlock.style.left = "5px";
            this.moveBlock.style.top = "5px";
            this.moveBlock.previousStyle = JSON.parse(JSON.stringify(this.moveBlock.style));
            this.moveBlock.updateFunction = (deltaX, deltaY) => {
                const leftValue = parseFloat(this.selectionRect.previousStyle.left.replace("%", ""));
                const topValue = parseFloat(this.selectionRect.previousStyle.top.replace("%", ""));
                const widthValue = parseFloat(this.selectionRect.previousStyle.width.replace("%", ""));
                const heightValue = parseFloat(this.selectionRect.previousStyle.height.replace("%", ""));
                deltaX = clamp(leftValue + widthValue + deltaX, 0, 100) - (leftValue + widthValue)
                deltaY = clamp(topValue + heightValue + deltaY, 0, 100) - (topValue + heightValue)
                this.resizeLeft.updateFunction(deltaX, deltaY);
                this.resizeTop.updateFunction(deltaX, deltaY);
                this.resizeWidth.updateFunction(0, 0);
                this.resizeHeight.updateFunction(0, 0);
            };

            [
                this.resizeLeft,
                this.resizeTop,
                this.resizeWidth,
                this.resizeHeight,
                this.resizeUpperLeft,
                this.resizeUpperRight,
                this.resizeLowerRight,
                this.resizeLowerLeft,
                this.moveBlock,
            ].forEach(resizeTool => {
                resizeTool.addEventListener("mousedown", event => {
                    this.selectionRect.previousStyle = JSON.parse(JSON.stringify(this.selectionRect.style));
                    resizeTool.mouseStart = [event.clientX, event.clientY];
                    resizeTool.clientRect = this.getBoundingClientRect();
                    resizeTool.active = true;
                    resizeTool.style.left = "-1000px";
                    resizeTool.style.top = "-1000px";
                    resizeTool.style.width = "calc(2000px + 100%)";
                    resizeTool.style.height = "calc(2000px + 100%)";
                    resizeTool.style.zIndex = 1;
                });
                resizeTool.addEventListener("mousemove", event => {
                    if(!resizeTool.active) return;
                    resizeTool.updateFunction(...[
                        100 * (event.clientX - resizeTool.mouseStart[0]) / resizeTool.clientRect.width,
                        100 * (event.clientY - resizeTool.mouseStart[1]) / resizeTool.clientRect.height,
                    ]);
                });
                resizeTool.addEventListener("mouseup", () => {
                    resizeTool.active = false;
                    resizeTool.style.left = resizeTool.previousStyle.left;
                    resizeTool.style.top = resizeTool.previousStyle.top;
                    resizeTool.style.width = resizeTool.previousStyle.width;
                    resizeTool.style.height = resizeTool.previousStyle.height;
                    resizeTool.style.zIndex = 0;
                    (async () => {
                        compute_cropped_images();
                    })();
                });
            });
        }

        disconnectedCallback() {
            
        }

        get rect() {
            return [
                this.selectionRect.style.left,
                this.selectionRect.style.top,
                this.selectionRect.style.width,
                this.selectionRect.style.height,
            ]
                .map(s => parseFloat(s.replace("%", "")) / 100)
                .map((coord, index) => coord * [this.imageContainer.image.naturalWidth, this.imageContainer.image.naturalHeight][index % 2])
                .map(coord => Math.round(coord));
        }
    }


    customElements.define("better-inpaint", BetterInpaintElement);
    customElements.define("better-inpaint-viewport", ViewportElement);
    // customElements.define("better-inpaint-tool-buttons", ToolButtonsElement);
    customElements.define("better-inpaint-viewport-image", ViewportImageElement);
    customElements.define("better-inpaint-viewport-mask", ViewportMaskElement);
    customElements.define("better-inpaint-selection-rectangle", SelectionRectangleElement);


    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }


    function watch_gradio_image(id, modifiedCallback) {
        const targetNode = document.querySelector(id);
        const config = { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] };
        const callback = function(mutationsList, _) {
            const completed = [];
            for(const mutation of mutationsList) {
                if(mutation.type === "childList") {
                    mutation.addedNodes.forEach(node => {
                        if(node.tagName === "IMG" && node.alt === ""  && !completed.includes(node)) {
                            modifiedCallback(node.src);
                            completed.push(node);
                        }
                    });
                    mutation.removedNodes.forEach(node => {
                        if(node.tagName === "IMG" && node.alt === ""  && !completed.includes(node)) {
                            modifiedCallback("");
                            completed.push(node);
                        }
                    });
                }
                else if(mutation.type === "attributes" && mutation.attributeName === "src" && mutation.target.tagName === "IMG" && mutation.target.alt === "" && !completed.includes(mutation.target)) {
                    modifiedCallback(mutation.target.src);
                    completed.push(node);
                }
            }
        };
        const observer = new MutationObserver(callback);
        observer.observe(targetNode, config);
        return observer;
    }


    function compute_cropped_images() {
        return new Promise((resolve, reject) => {
            const maskCanvas = document.querySelector("better-inpaint-viewport-mask > canvas");
            const maskRGBA = document.querySelector('better-inpaint-viewport-mask > img[data-type="RGBA"]');
            const maskL = document.querySelector('better-inpaint-viewport-mask > img[data-type="L"]');
            const image = document.querySelector('better-inpaint-viewport-image > img[data-type="full"]');
            const croppedImage = document.querySelector('better-inpaint-viewport-image > img[data-type="cropped"]');
            const selection = document.querySelector("better-inpaint-selection-rectangle");

            if(image.naturalWidth === 0 || image.naturalHeight === 0) {
                maskRGBA.src = "";
                maskL.src = "";
                croppedImage.src = "";
                request_update_cropped_image();
                resolve();
                return;
            }

            const rect = selection.rect;
            maskRGBA.src = maskCanvas.toDataURL("image/png");
            maskRGBA.onload = () => {
                Promise.all([
                    crop_image(image, croppedImage, rect),
                    crop_image(maskRGBA, maskRGBA, rect),
                ])
                    .then(request_update_cropped_image)
                    .then(resolve)
                    .catch(reject);
            };
        });
    }


    function crop_image(initialImage, imageResult, rect) {
        return new Promise((resolve, reject) => {
            const imageElement = document.createElement("img");
            imageElement.src = initialImage.src;
            imageElement.onload = () => {
                if(rect === undefined) rect = [0, 0, imageElement.width, imageElement.height];
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                const [x, y, w, h] = rect;
                canvas.width = w;
                canvas.height = h;
                ctx.drawImage(imageElement, x, y, w, h, 0, 0, w, h);
                imageResult.onload = resolve;
                imageResult.onerror = reject;
                imageResult.src = canvas.toDataURL("image/png");
            };
            imageElement.onerror = reject;
        });
    }


    function request_update_cropped_image() {
        document.querySelector("#img2img_better_inpaint_update_all").click();
    }


    function _better_inpaint_update_all() {
        // ouputs: [Cropped image, Cropped mask RGBA, (Resize to tab, Resize to sliders) -> later]
        const image = document.querySelector('better-inpaint-viewport-image > img[data-type="full"]');
        const croppedImage = document.querySelector('better-inpaint-viewport-image > img[data-type="cropped"]');
        const maskRGBA = document.querySelector('better-inpaint-viewport-mask > img[data-type="RGBA"]');

        if(image.naturalWidth === 0 || image.naturalHeight === 0) return [null, null];
        return [croppedImage.src, maskRGBA.src];
    }
    better_inpaint_update_all = _better_inpaint_update_all;
})();
