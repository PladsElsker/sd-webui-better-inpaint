import gradio as gr
from sdwi2iextender import OperationMode


class BetterInpaintTab(OperationMode):
    show_inpaint_params = True
    requested_elem_ids = ["img2img_mask_alpha"]

    def image_components(self):
        self.inpaint_alt_component = gr.Image(visible=False, label="Image", source="upload", interactive=True, type="pil", elem_id="img2img_better_inpaint_image")
        self.inpaint_mask_component = gr.Image(visible=False, label="Mask", interactive=True, type="pil", elem_id="img2img_better_inpaint_mask")
        return self.inpaint_alt_component, self.inpaint_mask_component

    def tab(self):
        with gr.TabItem(label='Better inpaint') as self.tab:
            self.better_inpaint_root = gr.HTML("", elem_id="img2img_better_inpaint_root")

    def section(self, components):
        self.mask_alpha = components["img2img_mask_alpha"]

    def gradio_events(self, selected: gr.Checkbox):
        self._update_sliders_visibility(selected)

    def _update_sliders_visibility(self, selected):
        selected.change(
            fn=lambda is_this_tab_selected: gr.update(visible=False) if is_this_tab_selected else gr.update(),
            inputs=[selected],
            outputs=[self.mask_alpha],
        )
