import gradio as gr
from sdwi2iextender import OperationMode

from .globals import BetterInpaintGlobals


class BetterInpaintTab(OperationMode):
    show_inpaint_params = True
    requested_elem_ids = ["img2img_mask_alpha", "img2img_inpaint_full_res"]

    def image_components(self):
        self.inpaint_img_component = gr.Image(label="Cropped image", interactive=False, type="pil", elem_id="img2img_better_inpaint_image")
        self.inpaint_img_component.unrender()
        self.inpaint_mask_component = gr.Image(label="Mask L", interactive=False, type="pil", elem_id="img2img_better_inpaint_mask")
        self.inpaint_mask_component.unrender()
        return self.inpaint_img_component, self.inpaint_mask_component

    def tab(self):
        with gr.TabItem(label='Better inpaint'):
            self.update_all = gr.Button(value="", visible=False, elem_id="img2img_better_inpaint_update_all")
            self.update_context_window = gr.Button(value="", visible=False, elem_id="img2img_better_inpaint_update_context_window")
            with gr.Row():
                self.inpaint_img_component.render()
                self.inpaint_mask_component.render()
                self.inpaint_mask_upload = gr.Image(label="Mask RGBA", interactive=False, type="pil", elem_id="img2img_better_inpaint_mask_upload")
            
            with gr.Row():
                self.inpaint_img_upload = BetterInpaintGlobals.image_upload
                self.inpaint_img_upload.render()
            
            with gr.Row():
                self.better_inpaint_root = gr.HTML("", elem_id="img2img_better_inpaint_root")

    def section(self, components: list):
        self.mask_alpha = components["img2img_mask_alpha"]
        self.inpaint_full_res = components["img2img_inpaint_full_res"]
        self.previous_inpaint_full_res = gr.State(0)
        self.context_window_json = BetterInpaintGlobals.context_window_json

    def gradio_events(self, selected: gr.Checkbox):
        self._update_sliders_visibility(selected)
        self._toggle_only_masked(selected)
        self._update_all_image_components(selected)
        self._update_context_window_data(selected)
        self._update_resize_to_slider_dimensions()
        self._update_script_ui(selected)

    def _update_sliders_visibility(self, selected: gr.Checkbox):
        selected.change(
            fn=lambda is_this_tab_selected: gr.update(visible=False) if is_this_tab_selected else gr.update(),
            inputs=[selected],
            outputs=[self.mask_alpha],
        )
    
    def _toggle_only_masked(self, selected: gr.Checkbox):
        def handle_only_masked_visibility(enabled, previous_choice_id):
            choices = [value for _, value in self.inpaint_full_res.choices]
            choice_id = 0 if enabled else previous_choice_id
            return choices[choice_id]

        selected.change(
            fn=handle_only_masked_visibility,
            inputs=[selected, self.previous_inpaint_full_res],
            outputs=[self.inpaint_full_res],
        )

        self.inpaint_full_res.change(
            fn=lambda enabled, choice_id, previous_choice_id: previous_choice_id if enabled else choice_id,
            inputs=[selected, self.inpaint_full_res, self.previous_inpaint_full_res],
            outputs=[self.previous_inpaint_full_res],
        )
    
    def _update_all_image_components(self, selected: gr.Checkbox):
        self.update_all.click(
            fn=None,
            inputs=[],
            outputs=[self.inpaint_img_component, self.inpaint_mask_upload, self.context_window_json],
            _js="better_inpaint_update_all",
        )
        self.inpaint_mask_upload.change(
            fn=lambda rgb_mask: gr.update(value=None if rgb_mask is None else rgb_mask.convert("L")),
            inputs=[self.inpaint_mask_upload],
            outputs=[self.inpaint_mask_component],
        )

    def _update_context_window_data(self, selected: gr.Checkbox):
        self.update_context_window.click(
            fn=None,
            inputs=[],
            outputs=[self.context_window_json],
            _js="better_inpaint_update_context_window",
        )

    def _update_resize_to_slider_dimensions(self):
        self.inpaint_img_component.change(fn=lambda: None, _js="updateImg2imgResizeToTextAfterChangingImage", inputs=[], outputs=[], show_progress=False)

    def _update_script_ui(self, selected: gr.Checkbox):
        selected.change(
            fn=lambda x: x,
            inputs=[selected],
            outputs=[BetterInpaintGlobals.deferred_is_tab_selected],
        )
    