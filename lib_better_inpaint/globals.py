from modules.shared import opts


class BetterInpaintGlobals:
    is_extension_enabled = opts.data.get('inpaint_difference_enabled', True)
