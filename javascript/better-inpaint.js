(async () => {
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
        betterInpaint.addEventListener("region", event => {
            const updatedRegion = event.region;
        });
        betterInpaint.addEventListener("mask", event => {
            const updatedMask = event.mask;
        });
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
            this.container.style.height = "800px";
            this.container.addEventListener("wheel", this.handleWheel);
            console.log("[sd-webui-better-inpaint] Root component created");
        }

        disconnectedCallback() {
            if(this.container) {
                this.container.removeEventListener("wheel", this.handleWheel);
            }
        }

        handleWheel(event) {
            event.preventDefault();
        }
    }


    customElements.define('better-inpaint', BetterInpaintElement);
})();
