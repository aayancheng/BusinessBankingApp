import numpy as np
import pandas as pd

from adjudication.src.reason_codes import top_adverse_shap


def test_top_adverse_shap_shape_and_sign():
    feature_names = ["a", "b", "c", "d"]
    shap_values = np.array([
        [0.1, 0.9, -0.5, 0.0],
        [-0.2, 0.0, 0.3, 0.1],
        [0.0, 0.0, 0.0, 0.0],
    ])
    out = top_adverse_shap(shap_values, feature_names, k=2)
    assert len(out) == 3
    # row 0 top adverse feature is 'b'
    assert out[0][0]["feature"] == "b"
    # only positive (adverse) contributions are returned
    for row in out:
        for item in row:
            assert item["impact"] > 0
    # row 2 (all zeros) yields no adverse reasons
    assert out[2] == []
