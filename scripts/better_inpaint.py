import gradio as gr
import json
from PIL import Image
import torchvision.transforms as T
pilToTensor = T.ToTensor()
tensorToPil = T.ToPILImage()

import modules.scripts as scripts

from lib_better_inpaint.globals import BetterInpaintGlobals
from lib_better_inpaint.webui_callbacks import setup_script_callbacks


setup_script_callbacks(BetterInpaintGlobals.is_extension_enabled)


class BetterInpaintScript(scripts.Script):
    def __init__(self):
        super().__init__()
    
    def title(self):
        return "Better Inpaint"

    def ui(self, is_img2img):
        BetterInpaintGlobals.deferred_is_tab_selected = gr.State(False)
        BetterInpaintGlobals.image_upload = gr.Image(label="Inpaint", source="upload", interactive=True, type="pil", elem_id="img2img_better_inpaint_image_upload", height=800)
        BetterInpaintGlobals.image_upload.unrender()
        BetterInpaintGlobals.context_window_json = gr.Textbox("", visible=False)
        return [
            BetterInpaintGlobals.deferred_is_tab_selected, 
            BetterInpaintGlobals.image_upload,
            BetterInpaintGlobals.context_window_json,
        ]
    
    def show(self, is_img2img):
        return scripts.AlwaysVisible if is_img2img else False

    def postprocess_batch_list(self, p, pp: scripts.PostprocessBatchListArgs, enabled, image, ctx_wd_json, *args, **kwargs):
        if not enabled:
            return
        
        context_window = json.loads(ctx_wd_json)
        context_box = [
            *context_window[:2],
            context_window[0] + context_window[2],
            context_window[1] + context_window[3],
        ]
        scale = [
            p.width / context_window[2],
            p.height / context_window[3],
        ]
        new_overlay_images = []
        for overlay in p.overlay_images:
            copy = image.copy().convert("RGBA")
            copy_alpha = copy.getchannel("A")
            overlay_alpha = overlay.resize(context_window[2:]).getchannel("A")
            copy_alpha.paste(overlay_alpha, context_box)
            copy.putalpha(copy_alpha)
            new_overlay_images.append(copy)
        
        p.overlay_images = new_overlay_images
        new_pp_images = []
        for processed in pp.images:
            pil_processed = tensorToPil(processed)
            black_background = Image.new("RGB", image.size)
            new_dimensions = [int(pil_processed.size[0] / scale[0]), int(pil_processed.size[1] / scale[1])]
            pil_processed = pil_processed.resize(new_dimensions)
            black_background.paste(pil_processed, context_window[:2])
            new_pp_images.append(pilToTensor(black_background))

        pp.images.clear()
        pp.images.extend(new_pp_images)
