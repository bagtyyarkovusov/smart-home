"""Generate original glTF 2.0 models from scaled cubes, in metres."""

import json
import struct
from pathlib import Path

OUTPUT = Path(__file__).resolve().parents[1] / "public" / "models"


def write_model(name, parts):
    vertices = [
        (x, y, z) for z in (-0.5, 0.5) for y in (-0.5, 0.5) for x in (-0.5, 0.5)
    ]
    triangles = [
        0,
        2,
        1,
        1,
        2,
        3,
        4,
        5,
        6,
        5,
        7,
        6,
        0,
        4,
        2,
        2,
        4,
        6,
        1,
        3,
        5,
        3,
        7,
        5,
        0,
        1,
        4,
        1,
        5,
        4,
        2,
        6,
        3,
        3,
        6,
        7,
    ]
    positions = b"".join(struct.pack("<3f", *vertex) for vertex in vertices)
    binary = positions + struct.pack("<36H", *triangles)
    document = {
        "asset": {"version": "2.0", "generator": "Smart Home evaluation"},
        "scene": 0,
        "scenes": [{"nodes": list(range(len(parts)))}],
        "nodes": [],
        "meshes": [],
        "materials": [],
        "buffers": [{"byteLength": len(binary)}],
        "bufferViews": [
            {"buffer": 0, "byteLength": len(positions), "target": 34962},
            {
                "buffer": 0,
                "byteOffset": len(positions),
                "byteLength": len(binary) - len(positions),
                "target": 34963,
            },
        ],
        "accessors": [
            {
                "bufferView": 0,
                "componentType": 5126,
                "count": 8,
                "type": "VEC3",
                "min": [-0.5] * 3,
                "max": [0.5] * 3,
            },
            {"bufferView": 1, "componentType": 5123, "count": 36, "type": "SCALAR"},
        ],
    }
    for index, (position, size, color) in enumerate(parts):
        document["nodes"].append(
            {"mesh": index, "translation": position, "scale": size}
        )
        document["meshes"].append(
            {
                "primitives": [
                    {"attributes": {"POSITION": 0}, "indices": 1, "material": index}
                ],
            }
        )
        document["materials"].append(
            {
                "pbrMetallicRoughness": {
                    "baseColorFactor": [*color, 1],
                    "metallicFactor": 0,
                },
            }
        )
    encoded = json.dumps(document, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    chunks = struct.pack("<I4s", len(encoded), b"JSON") + encoded
    chunks += struct.pack("<I4s", len(binary), b"BIN\0") + binary
    (OUTPUT / f"{name}.glb").write_bytes(
        struct.pack("<4sII", b"glTF", 2, 12 + len(chunks)) + chunks
    )


write_model(
    "floor-lamp",
    [
        ((0, 0.025, 0), (0.4, 0.05, 0.32), (0.10, 0.16, 0.23)),
        ((0, 0.53, 0), (0.05, 0.96, 0.05), (0.18, 0.24, 0.31)),
        ((0, 1.09, 0), (0.36, 0.22, 0.31), (0.92, 0.70, 0.39)),
    ],
)
write_model(
    "stool",
    [
        ((0, 0.41, 0), (0.48, 0.08, 0.48), (0.54, 0.24, 0.10)),
        *[
            ((x, 0.185, z), (0.07, 0.37, 0.07), (0.43, 0.21, 0.12))
            for x in (-0.18, 0.18)
            for z in (-0.18, 0.18)
        ],
    ],
)
