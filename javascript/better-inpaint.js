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
        const elementsToHide = getElementsToHide();
        if (inpaintRoot === null || elementsToHide.includes(null)) {
            setTimeout(() => { onBetterInpaintTabLoaded(callback); }, BETTER_INPAINT_POLLING_TIMEOUT);
            return;
        }
        callback();
    }


    function getBetterInpaintRoot() {
        return document.querySelector('#img2img_better_inpaint_root');
    }


    function getElementsToHide() {
        try {
            return [
                document.querySelector('#img2img_inpaint_full_res').parentElement.parentElement.parentElement,
                // document.querySelector('#img2img_better_inpaint_image'),
            ];
        }
        catch {
            return [null];
        }
    }


    function setupBetterInpaintRoot(root, elementsToHide) {
        hideRedundantComponents(root, elementsToHide);
        populateRoot(root);
    }


    function hideRedundantComponents(root, elementsToHide) {
        const callback = function(mutationsList, _) {
            for(const mutation of mutationsList) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
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
        const config = { attributes: true, attributeFilter: ['style'] };
        observer.observe(targetNode, config);
    }

    
    function populateRoot(root) {
        const betterInpaint = document.createElement('better-inpaint');
        root.appendChild(betterInpaint);
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

            this.viewport = document.createElement("better-inpaint-viewport");
            this.container.appendChild(this.viewport);
            this.viewport.style.width = "100%";
            this.viewport.style.height = "100%";
            this.viewport.style.position = "absolute";

            console.log("[sd-webui-better-inpaint] Root component created");
        }

        disconnectedCallback() {
            if(this.container) {
                this.container.removeEventListener("wheel", this.handleWheel);
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
            this.image = document.createElement("better-inpaint-viewport-image");
            this.appendChild(this.image);
            this.image.style.position = "absolute";
            this.image.style.width = "100%";

            this.mask = document.createElement("better-inpaint-viewport-mask");
            this.appendChild(this.mask);
            this.mask.style.position = "absolute";
            this.mask.style.width = "100%";
        }

        disconnectedCallback() {

        }
        
        get scale() {
            return this._scale;
        }

        set scale(value) {
            if(value > 1000) return;
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
            this.image_upload_observer = watch_gradio_image("#img2img_better_inpaint_image_upload", src => {
                this.image.src = src;
                const fn = () => {
                    compute_cropped_images()
                        .then(request_update_cropped_image)
                        .catch(console.log);
                };
                this.image.onload = fn;
                if(src === "") fn();
            });
            this.image.setAttribute("data-type", "full");
            this.image.style.position = "absolute";
            this.image.style.width = "100%";

            this.croppedImage = document.createElement("img");
            this.appendChild(this.croppedImage);
            this.croppedImage.setAttribute("data-type", "cropped");
            this.croppedImage.style.display = "none";
        }

        disconnectedCallback() {
            this.image_upload_observer.disconnect();
        }
    }


    class ViewportMaskElement extends HTMLElement {
        constructor() {
            super();
        }

        connectedCallback() {
            this.maskCanvas = document.createElement("canvas");
            this.appendChild(this.maskCanvas);

            this.mask = document.createElement("img");
            this.appendChild(this.mask);
            this.mask.setAttribute("data-type", "full");
            this.mask.style.display = "none";

            this.croppedMask = document.createElement("img");
            this.appendChild(this.croppedMask);
            this.croppedMask.setAttribute("data-type", "cropped");
            this.croppedMask.style.display = "none";
        }

        disconnectedCallback() {
            this.image_upload_observer.disconnect();
        }
    }


    customElements.define('better-inpaint', BetterInpaintElement);
    customElements.define('better-inpaint-viewport', ViewportElement);
    customElements.define('better-inpaint-viewport-image', ViewportImageElement);
    customElements.define('better-inpaint-viewport-mask', ViewportMaskElement);


    function watch_gradio_image(id, modifiedCallback) {
        const targetNode = document.querySelector(id);
        const config = { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] };
        const callback = function(mutationsList, _) {
            for(const mutation of mutationsList) {
                if(mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if(node.tagName === 'IMG') modifiedCallback(node.src);
                    });
                    mutation.removedNodes.forEach(node => {
                        if(node.tagName === 'IMG')  modifiedCallback("");
                    });
                }
                else if(mutation.type === 'attributes' && mutation.attributeName === 'src') {
                    modifiedCallback(mutation.target.src);
                }
            }
        };
        const observer = new MutationObserver(callback);
        observer.observe(targetNode, config);
        return observer;
    }


    function compute_cropped_images() {
        return new Promise((resolve, reject) => {
            const maskCanvas = document.querySelector('better-inpaint-viewport-mask > canvas');
            const mask = document.querySelector('better-inpaint-viewport-mask > img[data-type="full"]');
            const croppedMask = document.querySelector('better-inpaint-viewport-mask > img[data-type="cropped"]');
            const image = document.querySelector('better-inpaint-viewport-image > img[data-type="full"]');
            const croppedImage = document.querySelector('better-inpaint-viewport-image > img[data-type="cropped"]');

            const rect = undefined; // TODO: Implement rect selection

            if(image.naturalWidth === 0 || image.naturalHeight === 0) {
                mask.src = "";
                croppedMask.src = "";
                croppedImage.src = "";
                resolve();
                return;
            }

            maskCanvas.width = image.naturalWidth;
            maskCanvas.height = image.naturalHeight;
            mask.src = maskCanvas.toDataURL("image/png");
            mask.onload = () => {
                Promise.all([
                    crop_image(image, croppedImage, rect),
                    crop_image(mask, croppedMask, rect),
                ])
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
        // ouputs: [Mask, Cropped image, Cropped mask, (Resize to tab, Resize to sliders) -> later]
        const image = document.querySelector('better-inpaint-viewport-image > img[data-type="full"]');
        const croppedImage = document.querySelector('better-inpaint-viewport-image > img[data-type="cropped"]');
        const mask = document.querySelector('better-inpaint-viewport-mask > img[data-type="full"]');
        const croppedMask = document.querySelector('better-inpaint-viewport-mask > img[data-type="cropped"]');
        
        if(image.naturalWidth === 0 || image.naturalHeight === 0) return [null, null, null];
        return [mask.src, croppedImage.src, croppedMask.src];
    }
    better_inpaint_update_all = _better_inpaint_update_all;
})();
