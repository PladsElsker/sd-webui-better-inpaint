// The definition of these functions are in the IIFE. 
// The point is to keep a clean global scope. 
// Only these functions will be accessible globaly. 
let better_inpaint_update_all;
let better_inpaint_update_context_window;


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
        return [
            document.querySelector("#img2img_inpaint_full_res").parentElement.parentElement.parentElement,
            document.querySelector("#img2img_better_inpaint_mask").parentElement,
        ];
    }


    function setupBetterInpaintRoot(root, elementsToHide) {
        hideRedundantComponents(root, elementsToHide);
        populateRoot(root);
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
                        if(display === "block") {
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
        const targetNode = root.parentElement.parentElement.parentElement;
        const config = { attributes: true, attributeFilter: ["style"] };
        observer.observe(targetNode, config);
    }


    class BetterInpaintElement extends HTMLElement {
        constructor() {
            super();
            this.handleWheel = this.handleWheel.bind(this);
        }
        
        connectedCallback() {
            if(this.container) return;

            this.parentRow = document.querySelector("#img2img_better_inpaint_root").parentElement;
            this.parentRow.classList.add("better-inpaint-hidden");

            document.querySelector("#img2img_better_inpaint_image_upload > div[data-testid='block-label']").remove();

            this.container = document.createElement("div");
            this.appendChild(this.container);
            this.container.style.cursor = "default";
            this.container.style.userSelect = "none";
            this.container.style.position = "relative";
            this.container.style.overflow = "hidden";
            this.container.style.height = "800px";
            this.container.style.left = "0%";
            this.container.addEventListener("wheel", this.handleWheel);

            this.viewport = new ViewportElement();
            this.container.appendChild(this.viewport);
            this.viewport.style.width = "100%";
            this.viewport.style.height = "100%";
            this.viewport.style.left = "0%";
            this.viewport.style.position = "absolute";
            new ResizeObserver(this.resizeSelectionRect.bind(this)).observe(this.container);
            
            this.selectionToolSvg = `<svg xmlns="http://www.w3.org/2000/svg" height="100%" viewBox="0 -960 960 960" width="100%" fill="currentColor"><path d="M200-360h480v-320H200v320Zm-40 200q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm0-80h640v-480H160v480Zm0 0v-480 480Z"/></svg>`;
            this.drawToolSvg = `<svg xmlns="http://www.w3.org/2000/svg" height="100%" viewBox="0 -960 960 960" width="100%" fill="currentColor"><path d="M240-120q-45 0-89-22t-71-58q26 0 53-20.5t27-59.5q0-50 35-85t85-35q50 0 85 35t35 85q0 66-47 113t-113 47Zm0-80q33 0 56.5-23.5T320-280q0-17-11.5-28.5T280-320q-17 0-28.5 11.5T240-280q0 23-5.5 42T220-202q5 2 10 2h10Zm230-160L360-470l358-358q11-11 27.5-11.5T774-828l54 54q12 12 12 28t-12 28L470-360Zm-190 80Z"/></svg>`;

            this.image_upload_observer = watch_gradio_image("#img2img_better_inpaint_image_upload", src => {
                const image = this.viewport.image.image;
                image.src = src;
                image.onload = this.imageUploadChanged.bind(this);
                if(src === "") this.imageUploadChanged();
            });

            new ResizeObserver(this.viewportScaleChanged.bind(this)).observe(this.viewport);

            console.log("[sd-webui-better-inpaint] Root component created");
        }

        disconnectedCallback() {

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

        imageUploadChanged() {
            const image = this.viewport.image.image;
            const maskCanvas = this.viewport.mask.maskCanvas;

            if(image.naturalWidth === 0 || image.naturalHeight === 0) this.imageDeleted();
            else this.imageUploaded();
            
            maskCanvas.width = image.naturalWidth;
            maskCanvas.height = image.naturalHeight;
            this.resizeSelectionRect();
            compute_cropped_images();
        }

        imageUploaded() {
            const imageUploadComponent = document.querySelector("#img2img_better_inpaint_image_upload");
            const innerImage = imageUploadComponent.querySelector("div[data-testid='image'] > div > img");
            const annoyingPenButton = imageUploadComponent.querySelector("div[data-testid='image'] > div > div > button");

            innerImage.parentElement.insertBefore(this.parentRow, innerImage);
            innerImage.classList.add("better-inpaint-hidden");
            const customButtonTemplate = annoyingPenButton.cloneNode(true);
            annoyingPenButton.classList.add("better-inpaint-hidden");
            this.parentRow.classList.remove("better-inpaint-hidden");
            this.addCustomToolButtons(customButtonTemplate, annoyingPenButton.parentElement);
            this.viewportScaleChanged();
        }

        imageDeleted() {
            this.parentRow.classList.add("better-inpaint-hidden");
        }

        addCustomToolButtons(customButtonTemplate, buttonsRoot) {
            const selectionButton = customButtonTemplate.cloneNode(true);
            const drawButton = customButtonTemplate.cloneNode(true);

            buttonsRoot.addEventListener("wheel", event => this.handleWheel(event));

            selectionButton.querySelector("div").innerHTML = this.selectionToolSvg;
            drawButton.querySelector("div").innerHTML = this.drawToolSvg;
            selectionButton.setAttribute("title", "Context window");
            drawButton.setAttribute("title", "Draw");
            buttonsRoot.insertBefore(drawButton, buttonsRoot.children[0]);
            buttonsRoot.insertBefore(selectionButton, buttonsRoot.children[0]);

            const SELECTED = "#2c84e8";
            const DESELECTED = "";
            selectionButton.style.borderColor = SELECTED;
            this.viewport.selection.style.zIndex = 1;
            selectionButton.addEventListener("click", () => {
                selectionButton.style.borderColor = SELECTED;
                drawButton.style.borderColor = DESELECTED;
                this.viewport.selection.style.zIndex = 1;
                this.viewport.mask.style.zIndex = 0;
            });
            drawButton.addEventListener("click", () => {
                selectionButton.style.borderColor = DESELECTED;
                drawButton.style.borderColor = SELECTED;
                this.viewport.selection.style.zIndex = 0;
                this.viewport.mask.style.zIndex = 1;
            });
        }

        resizeSelectionRect() {
            const image = this.viewport.image.image;
            const selection = this.viewport.selection;
            const containerClientRect = this.container.getBoundingClientRect();

            selection.style.height = `${100 * ((image.naturalHeight / image.naturalWidth) * containerClientRect.width) / containerClientRect.height}%`;
        }

        viewportScaleChanged() {
            const bgImage = this.viewport.image.image;
            const elementsToPixelate = [this.viewport.mask.maskCanvas, this.viewport.image.image];
            
            elementsToPixelate.forEach(element => {
                const clientRect = element.getBoundingClientRect();
                if(clientRect.width > bgImage.naturalWidth) {
                    element.style.imageRendering = "pixelated";
                }
                else {
                    element.style.imageRendering = "";
                }
            });
        }
    }


    class ViewportElement extends HTMLElement {
        constructor() {
            super();
            this._scale = 100;
            this._offset = [0, 0];
        }
        
        connectedCallback() {
            if(this.image) return;

            this.image = new ViewportImageElement();
            this.appendChild(this.image);
            this.image.style.position = "absolute";
            this.image.style.width = "100%";
            this.image.style.left = "0%";

            this.mask = new ViewportMaskElement();
            this.appendChild(this.mask);
            this.mask.style.position = "absolute";
            this.mask.style.width = "100%";
            this.mask.style.left = "0%";

            this.selection = new SelectionRectangleElement(this.image);
            this.appendChild(this.selection);
            this.selection.style.position = "absolute";
            this.selection.style.width = "100%";
            this.selection.style.left = "0%";

            this.frontScreen = document.createElement("div");
            this.appendChild(this.frontScreen);
            this.frontScreen.style.position = "absolute";
            this.frontScreen.style.width = "10000%";
            this.frontScreen.style.height = "10000%";
            this.frontScreen.style.left = "-5000%";
            this.frontScreen.style.top = "-5000%";
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
            if(this.image) return;

            this.image = document.createElement("img");
            this.appendChild(this.image);
            this.image.setAttribute("data-type", "full");
            this.image.style.userSelect = "none";
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
            if(this.maskCanvas) return;

            this.maskCanvas = document.createElement("canvas");
            this.appendChild(this.maskCanvas);
            this.maskCanvas.style.userSelect = "none";
            this.maskCanvas.style.width = "100%";

            this.maskRGBA = document.createElement("img");
            this.appendChild(this.maskRGBA);
            this.maskRGBA.setAttribute("data-type", "RGBA");
            this.maskRGBA.style.display = "none";

            this.maskL = document.createElement("img");
            this.appendChild(this.maskL);
            this.maskL.setAttribute("data-type", "L");
            this.maskL.style.display = "none";

            this.mouseEventLayer = document.createElement("div");
            this.appendChild(this.mouseEventLayer);
            this.mouseEventLayer.style.position = "absolute";
            this.mouseEventLayer.style.width = "10000%";
            this.mouseEventLayer.style.height = "10000%";
            this.mouseEventLayer.style.left = "-5000%";
            this.mouseEventLayer.style.top = "-5000%";

            this.mouseEventLayer.addEventListener("mousedown", event => {
                this.maskCanvas.active = true;
            });
            const maskCanvas = this.maskCanvas;
            function releasePen(event) {
                maskCanvas.active = false;
                (async () => {
                    compute_cropped_images();
                })();
            }
            this.mouseEventLayer.addEventListener("mouseup", releasePen);
            this.mouseEventLayer.addEventListener("mouseleave", releasePen);
            this.mouseEventLayer.addEventListener("mousemove", this.draw.bind(this));
            this.mouseEventLayer.addEventListener("mousedown", this.draw.bind(this));
            this.mouseEventLayer.addEventListener("contextmenu", event => {
                event.preventDefault();
            });
        }

        disconnectedCallback() {
            
        }

        draw(event) {
            if(!this.maskCanvas.active) return;
                
            let color;
            let compositeOperation;
            if (event.buttons === 1) {
                color = "#FFFFFF";
                compositeOperation = "source-over";
            }
            else {
                color = "#000000";
                compositeOperation = "destination-out";
            }
            const clientRect = this.maskCanvas.getBoundingClientRect();
            const position1 = [
                (event.clientX - clientRect.left - event.movementX) * this.maskCanvas.width / clientRect.width,
                (event.clientY - clientRect.top - event.movementY) * this.maskCanvas.height / clientRect.height,
            ];
            const position2 = [
                position1[0] + (event.movementX * this.maskCanvas.width / clientRect.width), 
                position1[1] + (event.movementY * this.maskCanvas.height / clientRect.height),
            ];
            const diameter = 50;

            const context = this.maskCanvas.getContext("2d", { willReadFrequently: true });
            context.imageSmoothingEnabled = false;
            context.globalCompositeOperation = compositeOperation;
            context.beginPath();
            context.lineWidth = diameter;
            context.lineCap = "round";
            context.strokeStyle = color;
            context.moveTo(...position1);
            context.lineTo(...position2);
            context.stroke();

            const x1 = new Date().getTime() / 1000;
            this.saturatePixels(context, position1, position2, diameter);
            const x2 = new Date().getTime() / 1000;
            console.log(`Time taken: ${x2 - x1}`);
        }

        saturatePixels(context, position1, position2, diameter) {
            const [x, y, width, height] = this.getNewlyDrawnBoundingBox(position1, position2, (diameter + 4) / 2);
            const imageData = context.getImageData(x, y, width, height);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                const alpha = data[i + 3];
                if (alpha > 0) {
                    data[i] = data[i] > 128 ? 255 : 0;
                    data[i + 1] = data[i + 1] > 128 ? 255 : 0;
                    data[i + 2] = data[i + 2] > 128 ? 255 : 0;
                    data[i + 3] = data[i + 3] > 128 ? 255 : 0;
                }
            }
            context.putImageData(imageData, x, y);
        }

        getNewlyDrawnBoundingBox(position1, position2, radius) {
            const x1 = Math.min(position1[0], position2[0]) - radius;
            const x2 = Math.max(position1[0], position2[0]) + radius;
            const y1 = Math.min(position1[1], position2[1]) - radius;
            const y2 = Math.max(position1[1], position2[1]) + radius;
            return [x1, y1, x2 - x1, y2 - y1];
        }
    }


    class SelectionRectangleElement extends HTMLElement {
        constructor(imageContainer) {
            super();
            this.imageContainer = imageContainer;
        }

        connectedCallback() {
            if(this.selectionRect) return;

            this.selectionShadowContainer = document.createElement("div");
            this.appendChild(this.selectionShadowContainer);
            this.selectionShadowContainer.style.position = "absolute";
            this.selectionShadowContainer.style.overflow = "hidden";
            this.selectionShadowContainer.style.left = "0%";
            this.selectionShadowContainer.style.top = "0%";
            this.selectionShadowContainer.style.width = "100%";
            this.selectionShadowContainer.style.height = "100%";

            this.selectionShadow = document.createElement("div");
            this.selectionShadowContainer.appendChild(this.selectionShadow);
            this.selectionShadow.style.position = "absolute";
            this.selectionShadow.style.boxShadow = "0 0 0 100vh rgba(0, 0, 0, .7)";
            this.selectionShadow.style.left = "0%";
            this.selectionShadow.style.top = "0%";
            this.selectionShadow.style.width = "100%";
            this.selectionShadow.style.height = "100%";

            this.selectionRect = document.createElement("div");
            this.appendChild(this.selectionRect);
            this.selectionRect.style.position = "absolute";
            this.selectionRect.style.border = "2px dashed #ccc";
            this.selectionRect.style.left = "0%";
            this.selectionRect.style.top = "0%";
            this.selectionRect.style.width = "100%";
            this.selectionRect.style.height = "100%";

            this.updateSelectionShadowStyle();

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
                resizeTool.style.userSelect = "none";
                resizeTool.addEventListener("mousedown", event => {
                    if (event.buttons !== 1) return;

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
                    if (event.buttons !== 1) return;
                    if(!resizeTool.active) return;

                    resizeTool.updateFunction(...[
                        100 * (event.clientX - resizeTool.mouseStart[0]) / resizeTool.clientRect.width,
                        100 * (event.clientY - resizeTool.mouseStart[1]) / resizeTool.clientRect.height,
                    ]);
                });
                function releaseSelection(event) {
                    if(!resizeTool.active) return;

                    resizeTool.active = false;
                    resizeTool.style.left = resizeTool.previousStyle.left;
                    resizeTool.style.top = resizeTool.previousStyle.top;
                    resizeTool.style.width = resizeTool.previousStyle.width;
                    resizeTool.style.height = resizeTool.previousStyle.height;
                    resizeTool.style.zIndex = 0;
                    (async () => {
                        compute_cropped_images();
                    })();
                }
                resizeTool.addEventListener("mouseup", releaseSelection);
                resizeTool.addEventListener("mouseleave", releaseSelection);
                document.addEventListener("keydown", event => {
                    if(!resizeTool.active) return;
                    if(event.key !== "Escape") return;

                    resizeTool.active = false;
                    resizeTool.style.left = resizeTool.previousStyle.left;
                    resizeTool.style.top = resizeTool.previousStyle.top;
                    resizeTool.style.width = resizeTool.previousStyle.width;
                    resizeTool.style.height = resizeTool.previousStyle.height;
                    resizeTool.style.zIndex = 0;
                    this.selectionRect.style.left = this.selectionRect.previousStyle.left;
                    this.selectionRect.style.top = this.selectionRect.previousStyle.top;
                    this.selectionRect.style.width = this.selectionRect.previousStyle.width;
                    this.selectionRect.style.height = this.selectionRect.previousStyle.height;
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

        updateSelectionShadowStyle() {
            const observer = new MutationObserver(mutationsList => {
                for(const mutation of mutationsList) {
                    if(mutation.type === 'attributes' && mutation.attributeName === 'style') {
                        this.selectionShadow.style.left = this.selectionRect.style.left;
                        this.selectionShadow.style.top = this.selectionRect.style.top;
                        this.selectionShadow.style.width = this.selectionRect.style.width;
                        this.selectionShadow.style.height = this.selectionRect.style.height;
                    }
                }
            });
            observer.observe(this.selectionRect, { attributes: true, attributeFilter: ['style'] });
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
                        if(
                            node.tagName === "IMG" && 
                            node.alt === "" && 
                            node.nextElementSibling && 
                            node.nextElementSibling.tagName === "INPUT" && 
                            !completed.includes(node)
                        ) {
                            modifiedCallback(node.src);
                            completed.push(node);
                        }
                    });
                    mutation.removedNodes.forEach(node => {
                        if(
                            node.tagName === "IMG" && 
                            node.alt === "" && 
                            !completed.includes(node)
                        ) {
                            modifiedCallback("");
                            completed.push(node);
                        }
                    });
                }
                else if(
                    mutation.type === "attributes" && 
                    mutation.attributeName === "src" && 
                    mutation.target.tagName === "IMG" && 
                    mutation.target.nextElementSibling && 
                    mutation.target.nextElementSibling.tagName === "INPUT" && 
                    mutation.target.alt === "" && 
                    !completed.includes(mutation.target)
                ) {
                    modifiedCallback(mutation.target.src);
                    completed.push(mutation.target);
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
                request_update_context_window();
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
                    .then(request_update_context_window)
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
        const image = document.querySelector('better-inpaint-viewport-image > img[data-type="full"]');
        const croppedImage = document.querySelector('better-inpaint-viewport-image > img[data-type="cropped"]');
        const maskRGBA = document.querySelector('better-inpaint-viewport-mask > img[data-type="RGBA"]');
        const selection = document.querySelector("better-inpaint-selection-rectangle");

        if(image.naturalWidth === 0 || image.naturalHeight === 0) return [null, null];
        return [croppedImage.src, maskRGBA.src, JSON.stringify(selection.rect)];
    }
    better_inpaint_update_all = _better_inpaint_update_all;


    function request_update_context_window() {
        document.querySelector("#img2img_better_inpaint_update_context_window").click();
    }

    
    function _better_inpaint_update_context_window() {
        const image = document.querySelector('better-inpaint-viewport-image > img[data-type="full"]');
        const selection = document.querySelector("better-inpaint-selection-rectangle");
        if(image.naturalWidth === 0 || image.naturalHeight === 0) return '""';
        return [JSON.stringify(selection.rect)];
    }
    better_inpaint_update_context_window = _better_inpaint_update_context_window;
})();
