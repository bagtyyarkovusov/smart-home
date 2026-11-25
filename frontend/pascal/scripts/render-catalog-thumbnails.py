"""Render the bundled catalog GLBs with Blender 4.5.4 LTS and cwebp 1.6.0."""

import json
import subprocess
from math import cos, radians, sin
from pathlib import Path
from tempfile import TemporaryDirectory

import bpy
from mathutils import Matrix, Vector

PROJECT = Path(__file__).resolve().parents[1]
PUBLIC = PROJECT / "public"


def add_light(name, center, offset, size, strength, model_size):
    bpy.ops.object.light_add(type="AREA", location=center + Vector(offset) * model_size)
    light = bpy.context.object
    light.name = name
    light.rotation_euler = (center - light.location).to_track_quat("-Z", "Y").to_euler()
    light.data.size = size * model_size
    light.data.energy = strength * model_size**2


def render(asset, png):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    bpy.ops.import_scene.gltf(filepath=str(PUBLIC / asset["src"].lstrip("/")))
    sx, sy, sz = asset.get("scale", (1, 1, 1))
    scale = Matrix.Diagonal((sx, sz, sy, 1))  # Blender uses Z up.
    for root in tuple(scene.objects):
        if root.parent is None:
            root.matrix_world = scale @ root.matrix_world

    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = [
        evaluated.matrix_world @ Vector(corner)
        for obj in scene.objects if obj.type == "MESH"
        for evaluated in [obj.evaluated_get(depsgraph)]
        for corner in evaluated.bound_box
    ]
    minimum, maximum = (Vector(fn(p[i] for p in points) for i in range(3)) for fn in (min, max))
    center = (minimum + maximum) / 2
    size = max(maximum - minimum)
    pitch = radians(62 if asset["dimensions"][1] < size * 0.1 else 35)
    yaw = radians(30)
    offset = Vector((cos(pitch) * sin(yaw), -cos(pitch) * cos(yaw), sin(pitch)))
    bpy.ops.object.camera_add(location=center + offset * size * 4)
    camera = bpy.context.object
    aim = (-offset).to_track_quat("-Z", "Y")
    camera.rotation_euler = aim.to_euler()
    camera.data.type = "ORTHO"
    # Center and fit the projected extents, leaving a transparent margin on each side.
    inverse = aim.inverted()
    projected = [inverse @ (point - center) for point in points]
    low_x, high_x = min(p.x for p in projected), max(p.x for p in projected)
    low_y, high_y = min(p.y for p in projected), max(p.y for p in projected)
    camera.location += aim @ Vector(((low_x + high_x) / 2, (low_y + high_y) / 2, 0))
    camera.data.ortho_scale = max(high_x - low_x, high_y - low_y) / 0.85
    scene.camera = camera

    scene.world = bpy.data.worlds.new("Studio")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.45, 0.45, 0.45, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35
    add_light("Key", center, (-1.7, -2, 2.8), 2.6, 410, size)
    add_light("Fill", center, (2, -0.8, 1.6), 2.4, 230, size)
    add_light("Rim", center, (0.5, 1.7, 2.1), 2.1, 190, size)
    scene.view_settings.exposure = -0.9
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 256
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = str(png)
    bpy.ops.render.render(write_still=True)


with TemporaryDirectory() as temp:
    png = Path(temp) / "preview.png"
    catalog = json.loads((PROJECT / "app" / "furniture-catalog.json").read_text())
    for asset in catalog:
        thumbnail = PUBLIC / asset["thumbnail"].lstrip("/")
        thumbnail.parent.mkdir(parents=True, exist_ok=True)
        render(asset, png)
        subprocess.run(["cwebp", "-quiet", "-q", "87", "-m", "6", str(png), "-o", str(thumbnail)], check=True)
