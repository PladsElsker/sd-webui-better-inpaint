from modules.shared import opts, OptionInfo

from lib_better_inpaint.globals import BetterInpaintGlobals


def create_settings_section():
    section = ("better_inpaint", "Better Inpaint")
    opts.add_option("inpaint_difference_enabled", OptionInfo(True, "Enable inpaint-difference extension", section=section).needs_restart())
    update_global_settings()


def update_global_settings():
    BetterInpaintGlobals.is_extension_enabled = opts.data.get("inpaint_difference_enabled", True)
