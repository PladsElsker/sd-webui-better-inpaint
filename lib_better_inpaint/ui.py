import gradio as gr
from sdwi2iextender import OperationMode


class BetterInpaintTab(OperationMode):
    show_inpaint_params = True
    requested_elem_ids = ["img2img_mask_alpha"]

    def image_components(self):
        self.inpaint_img_component = gr.Image(visible=True, label="Cropped image", interactive=False, type="pil", elem_id="img2img_better_inpaint_image")
        self.inpaint_img_component.unrender()
        self.inpaint_mask_component = gr.Image(visible=True, label="Cropped mask", interactive=False, type="pil", elem_id="img2img_better_inpaint_mask")
        self.inpaint_mask_component.unrender()
        return self.inpaint_img_component, self.inpaint_mask_component

    def tab(self):
        with gr.TabItem(label='Better inpaint') as self.tab:
            self.update_all = gr.Button(value="", visible=False, elem_id="img2img_better_inpaint_update_all")
            with gr.Row():
                self.inpaint_img_component.render()
                self.inpaint_mask_component.render()
                self.inpaint_img_upload = gr.Image(label="Image", source="upload", interactive=True, type="pil", elem_id="img2img_better_inpaint_image_upload")
                self.inpaint_mask_upload = gr.Image(visible=True, label="Mask", interactive=False, type="pil", elem_id="img2img_better_inpaint_mask_upload")
            
            self.better_inpaint_root = gr.HTML("", elem_id="img2img_better_inpaint_root")

    def section(self, components: list):
        self.mask_alpha = components["img2img_mask_alpha"]

    def gradio_events(self, selected: gr.Checkbox):
        self._update_sliders_visibility(selected)
        self._update_all_image_components(selected)

    def _update_sliders_visibility(self, selected: gr.Checkbox):
        selected.change(
            fn=lambda is_this_tab_selected: gr.update(visible=False) if is_this_tab_selected else gr.update(),
            inputs=[selected],
            outputs=[self.mask_alpha],
        )
    
    def _update_all_image_components(self, selected: gr.Checkbox):
        self.update_all.click(
            fn=None,
            inputs=[],
            outputs=[self.inpaint_img_component, self.inpaint_mask_upload],
            _js="better_inpaint_update_all"
        )
        self.inpaint_mask_upload.change(
            fn=lambda rgb_mask: gr.update(value=None if rgb_mask is None else rgb_mask.convert("L")),
            inputs=[self.inpaint_mask_upload],
            outputs=[self.inpaint_mask_component],
        )
