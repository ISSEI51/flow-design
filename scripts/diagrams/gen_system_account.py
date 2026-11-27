"""Generate System & Account (Patterns) diagrams (.drawio).

Usage: python3 scripts/diagrams/gen_system_account.py [output_dir]
The diagrams are split by pattern into sa_*.py modules (sa_overview.py, sa_authentication.py, sa_settings.py,
sa_onboarding.py, sa_permission.py, sa_system.py, sa_notifications.py). Each module defines its diagrams and
saves them when imported. Shared drawing helpers live in sa_common.py. The output is deterministic.
"""
import glob
import importlib
import os
import sys

sys.dont_write_bytecode = True  # import で __pycache__ を作らない
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

for path in sorted(glob.glob(os.path.join(HERE, "sa_*.py"))):
    name = os.path.splitext(os.path.basename(path))[0]
    if name == "sa_common":
        continue
    importlib.import_module(name)
print("ok system-account")
