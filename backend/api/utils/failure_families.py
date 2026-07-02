from typing import Dict

# Failure mode families — same family = genuine recurrence, not coincidence.
# Shared by the attribution worker and the events router recurrence check.
FAILURE_FAMILIES: Dict[str, str] = {
    # Mechanical
    "VIBE-HIGH": "mechanical", "VIBE-LOW": "mechanical",
    "BEARING-FAIL": "mechanical", "IMBALANCE": "mechanical",
    "MISALIGN": "mechanical", "CAVITATION": "mechanical",
    "VIBRATION": "mechanical",
    # Seal / leak
    "SEAL-FAIL": "seal", "LEAK-MECH": "seal", "LEAK-PROCESS": "seal",
    # Electrical
    "MOTOR-FAIL": "electrical", "OVERLOAD": "electrical", "INSULATION": "electrical",
    # Process
    "LOW-FLOW": "process", "HIGH-TEMP": "process", "PRESSURE-LOSS": "process",
}
