from modules.shared import opts


class BetterInpaintGlobals:
    is_extension_enabled = opts.data.get('inpaint_difference_enabled', True)
    deferred_is_tab_selected = None
    image_upload = None
