"""Original procedural sculpture study. Run only through Blender background Python.

All outputs are fixed filenames beside this script; no arbitrary output argument.
--draft: preserve first previews; --inspect: reopen the delivered .blend and inspect.
"""
import bpy
import json
import math
import struct
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
if ROOT.name != "blender-v01" or ROOT.parent.name != "art":
    raise RuntimeError("This generator must remain in art/blender-v01")


def output(name):
    path = ROOT / name
    if path.resolve().parent != ROOT:
        raise RuntimeError("Output escaped the study directory")
    return str(path)


def inspect_scene():
    bpy.ops.wm.open_mainfile(filepath=output("asura-altar.blend"))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    corners = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    raw = Path(output("asura-altar.glb")).read_bytes()
    magic, version, length = struct.unpack("<4sII", raw[:12])
    if magic != b"glTF" or version != 2 or length != len(raw):
        raise RuntimeError("GLB header/length validation failed")
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated_vertices = evaluated_polygons = 0
    for obj in bpy.context.scene.objects:
        if obj.type in {"MESH", "CURVE"}:
            evaluated = obj.evaluated_get(depsgraph)
            mesh = evaluated.to_mesh()
            try:
                if any(not math.isfinite(x) for v in mesh.vertices for x in v.co):
                    raise RuntimeError("Nonfinite reopened geometry: " + obj.name)
                evaluated_vertices += len(mesh.vertices)
                evaluated_polygons += len(mesh.polygons)
            finally:
                evaluated.to_mesh_clear()
    from bpy_extras.object_utils import world_to_camera_view
    coverage = {}
    subjects = [o for o in bpy.context.scene.objects
                if any(c.name.startswith(("01_", "02_")) for c in o.users_collection)]
    for camera in (o for o in bpy.context.scene.objects if o.type == "CAMERA"):
        points = [world_to_camera_view(bpy.context.scene, camera, o.matrix_world @ Vector(v))
                  for o in subjects for v in o.bound_box]
        coverage[camera.name] = {"min_xy": [min(v[i] for v in points) for i in range(2)],
                                 "max_xy": [max(v[i] for v in points) for i in range(2)],
                                 "all_bounds_in_frame": all(0 <= v.x <= 1 and 0 <= v.y <= 1 and v.z > 0 for v in points)}
    report = {
        "blender_version": bpy.app.version_string,
        "collections": {c.name: len(c.objects) for c in bpy.data.collections},
        "objects": len(bpy.context.scene.objects),
        "mesh_objects": len(meshes),
        "vertices": sum(len(o.data.vertices) for o in meshes),
        "mesh_polygons": sum(len(o.data.polygons) for o in meshes),
        "evaluated_vertices_including_curves": evaluated_vertices,
        "evaluated_polygons_including_curves": evaluated_polygons,
        "finite_geometry": True,
        "bounds_min": [min(v[i] for v in corners) for i in range(3)],
        "bounds_max": [max(v[i] for v in corners) for i in range(3)],
        "materials": [m.name for m in bpy.data.materials],
        "engine": bpy.context.scene.render.engine,
        "device": bpy.context.scene.cycles.device,
        "device_discovery": json.loads(bpy.context.scene["device_discovery"]),
        "render_samples": bpy.context.scene.cycles.samples,
        "camera_subject_coverage": coverage,
        "glb": {"magic": magic.decode(), "version": version,
                "declared_bytes": length, "actual_bytes": len(raw)},
        "outputs": ["asura-altar.blend", "asura-altar.glb", "beauty.png", "game-angle.png"],
        "limits": ["Procedural unrigged sculptural study, not a final commercial character",
                   "Material procedural noise is Blender-specific; GLB uses base PBR factors",
                   "No gameplay integration, animation, mobile performance or FPS claim"],
    }
    Path(output("scene-report.json")).write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("SCENE_INSPECTION", json.dumps(report))


if "--inspect" in sys.argv:
    inspect_scene()
    raise SystemExit(0)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for block in list(bpy.data.collections):
    if block.name != "Collection":
        bpy.data.collections.remove(block)


def collection(name):
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


HERO = collection("01_ASURA_six_armed_original_sculpture")
ALTAR = collection("02_LOTUS_lightning_altar")
STAGE = collection("03_STONE_floating_dais")
RIG = collection("04_CAMERAS_and_lighting")
CURRENT = HERO


def place(obj, name, mat=None):
    obj.name = name
    for col in list(obj.users_collection):
        col.objects.unlink(obj)
    CURRENT.objects.link(obj)
    if mat:
        obj.data.materials.append(mat)
    if obj.type == "MESH":
        for face in obj.data.polygons:
            face.use_smooth = True
    return obj


def material(name, color, metal=0, rough=.5, noise=False, emission=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*color, 1)
        bsdf.inputs["Emission Strength"].default_value = emission
    if noise:
        tex = mat.node_tree.nodes.new("ShaderNodeTexNoise")
        tex.inputs["Scale"].default_value = 13
        bump = mat.node_tree.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = .18
        bump.inputs["Distance"].default_value = .055
        mat.node_tree.links.new(tex.outputs["Fac"], bump.inputs["Height"])
        mat.node_tree.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


skin = material("red_copper_terracotta", (.245, .045, .023), .5, .46, True)
gold = material("aged_dark_gold", (.48, .25, .062), .82, .32, True)
edge = material("polished_copper_edges", (.65, .28, .093), .78, .24)
indigo = material("indigo_woven_drapery", (.018, .034, .115), .08, .7, True)
stone = material("rough_charcoal_basalt", (.055, .068, .079), .08, .86, True)
stone_top = material("cut_blue_grey_stone", (.11, .15, .18), .05, .72, True)
black = material("deep_carved_recess", (.013, .009, .008), 0, .85)
ivory = material("warm_eyes_and_fangs", (.78, .58, .25), .2, .3)
flame = material("amber_living_flame", (1, .17, .015), .15, .28, emission=3)
crystal = material("electric_indigo_crystal", (.035, .22, .8), .4, .25, emission=1.5)


def ell(name, loc, scale, mat, seg=24, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, location=loc)
    obj = place(bpy.context.object, name, mat)
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def cone(name, loc, radius, depth, mat, top=None, vertices=48):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius,
                                   radius2=radius if top is None else top,
                                   depth=depth, location=loc)
    return place(bpy.context.object, name, mat)


def bar(name, a, b, r1, r2, mat, vertices=20):
    d = Vector(b) - Vector(a)
    obj = cone(name, (Vector(a) + Vector(b)) / 2, r1, d.length, mat, r2, vertices)
    obj.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    return obj


def torus(name, loc, major, minor, mat, rotate=None):
    bpy.ops.mesh.primitive_torus_add(major_segments=64, minor_segments=10,
                                   location=loc, major_radius=major, minor_radius=minor)
    obj = place(bpy.context.object, name, mat)
    if rotate:
        obj.rotation_euler = rotate
    return obj


def curve(name, pts, thick, mat):
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.bevel_depth = thick
    data.bevel_resolution = 3
    spline = data.splines.new("BEZIER")
    spline.bezier_points.add(len(pts) - 1)
    for point, co in zip(spline.bezier_points, pts):
        point.co = co
        point.handle_left_type = point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, data)
    CURRENT.objects.link(obj)
    data.materials.append(mat)
    return obj


def petal(name, center, angle, length, width, lift, mat):
    verts = []
    steps = 10
    for i in range(steps + 1):
        t = i / steps
        rad = .25 + length * t
        # Keep three distinct tip vertices: a fully collapsed strip destabilizes
        # Solidify/Bevel and creates NaNs in Blender 4.5.10 evaluated geometry.
        w = max(.015, width * max(0, math.sin(math.pi * t)) ** .7)
        z = center[2] + lift * t ** 1.6
        for side in (-1, 0, 1):
            verts.append((center[0] + rad * math.cos(angle) - side * w * math.sin(angle),
                          center[1] + rad * math.sin(angle) + side * w * math.cos(angle),
                          z + (1 - abs(side)) * .12 * math.sin(math.pi * t)))
    faces = []
    for i in range(steps):
        for j in range(2):
            k = i * 3 + j
            faces.append((k, k + 1, k + 4, k + 3))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    CURRENT.objects.link(obj)
    mesh.materials.append(mat)
    solid = obj.modifiers.new("Cast bronze thickness", "SOLIDIFY")
    solid.thickness = .045
    bevel = obj.modifiers.new("Soft cast edges", "BEVEL")
    bevel.width = .025
    bevel.segments = 2
    return obj


HX, HY = -1.65, -.35


def h(v):
    return (HX + v[0], HY + v[1], v[2])


# Circular tabletop miniature plinth and individually articulated anatomy.
cone("commander_round_plinth", h((0, 0, .35)), 1.23, .3, stone, 1.15)
torus("plinth_copper_inlay", h((0, 0, .49)), 1.10, .04, gold)
for s in (-1, 1):
    ell("planted_bare_foot", h((s * .38, -.20, .65)), (.22, .39, .15), skin)
    bar("powerful_shin", h((s * .38, 0, .68)), h((s * .43, .08, 1.35)), .17, .21, skin)
    ell("sculpted_knee", h((s * .43, -.025, 1.37)), (.215, .19, .22), skin)
    bar("quadriceps", h((s * .43, .08, 1.40)), h((s * .29, 0, 2.10)), .23, .29, skin)
    torus("anklet", h((s * .38, 0, .81)), .17, .045, gold)
    for toe in range(4):
        ell("individual_toe", h((s * .38 + (toe - 1.5) * .075, -.48, .64)), (.047, .105, .055), skin, 12, 8)
ell("waist", h((0, .02, 2.13)), (.43, .27, .46), skin)
ell("ribcage", h((0, .04, 2.70)), (.64, .32, .69), skin)
for s in (-1, 1):
    ell("defined_pectoral", h((s * .27, -.235, 2.98)), (.31, .19, .23), skin)
    for z in (2.70, 2.49, 2.29):
        ell("sculpted_abdominal", h((s * .13, -.252, z)), (.14, .10, .12), skin)
    curve("collar_ridge", [h((s * .05, -.24, 3.20)), h((s * .30, -.27, 3.23)), h((s * .53, -.12, 3.16))], .045, edge)
bar("neck", h((0, .025, 3.1)), h((0, .025, 3.54)), .22, .2, skin)
ell("recognizable_head", h((0, -.015, 3.72)), (.33, .27, .40), skin, 40, 28)
ell("chin_and_jaw", h((0, -.16, 3.48)), (.23, .16, .17), skin)
for s in (-1, 1):
    ell("ear", h((s * .33, -.005, 3.68)), (.08, .065, .14), skin)
    ring = torus("large_earring", h((s * .35, -.03, 3.49)), .105, .026, gold, (math.pi / 2, 0, 0))
    ell("cheekbone", h((s * .20, -.215, 3.62)), (.13, .11, .13), skin)
    ell("carved_eye_socket", h((s * .13, -.253, 3.78)), (.105, .042, .066), black)
    ell("luminous_almond_eye", h((s * .13, -.286, 3.78)), (.071, .025, .023), ivory)
    ell("focused_carved_pupil", h((s * .13, -.309, 3.78)), (.017, .009, .021), black, 16, 10)
    curve("fierce_brow", [h((s * .04, -.277, 3.84)), h((s * .14, -.29, 3.88)), h((s * .24, -.245, 3.85))], .045, skin)
ell("nose_bridge", h((0, -.282, 3.69)), (.07, .09, .14), skin)
ell("nose_tip", h((0, -.35, 3.63)), (.09, .07, .06), edge)
curve("carved_mouth", [h((-.14, -.273, 3.51)), h((0, -.31, 3.49)), h((.14, -.273, 3.51))], .018, black)
ell("third_eye_setting", h((0, -.25, 3.98)), (.047, .035, .065), gold)
ell("third_eye_crystal", h((0, -.284, 3.98)), (.023, .015, .035), crystal)

# Six separated arms, with segmented hands rather than capsule silhouettes.
arms = [((- .54, .04, 3.08), (-1.0, .02, 3.45), (-1.25, -.05, 3.90)),
        (( .54, .04, 3.08), ( 1.0, .02, 3.46), ( 1.35, -.09, 3.85)),
        ((-.54, .13, 2.87), (-1.11, -.06, 2.88), (-1.44, -.30, 3.18)),
        (( .54, .13, 2.87), ( 1.13, -.05, 2.86), ( 1.52, -.26, 3.07)),
        ((-.48, .19, 2.65), (-.88, -.10, 2.31), (-1.20, -.43, 2.55)),
        (( .48, .19, 2.65), ( .87, -.11, 2.29), ( 1.20, -.44, 2.48))]
for i, (a, b, c) in enumerate(arms):
    ell(f"arm_{i+1}_deltoid", h(a), (.235, .23, .25), skin)
    bar(f"arm_{i+1}_bicep", h(a), h(b), .21, .16, skin)
    ell(f"arm_{i+1}_elbow", h(b), (.16, .15, .16), skin)
    bar(f"arm_{i+1}_forearm", h(b), h(c), .17, .105, skin)
    wrist = Vector(c).lerp(Vector(b), .18)
    bar(f"arm_{i+1}_gold_bracer", h(wrist), h(Vector(c).lerp(Vector(b), .38)), .153, .165, gold)
    ell(f"arm_{i+1}_palm", h(c), (.125, .09, .16), skin)
    for f in range(4):
        start = Vector(c) + Vector(((f - 1.5) * .048, -.015, .10))
        end = start + Vector((.018 * (-1 if i % 2 else 1), -.025, .15 + .025 * (1 - abs(f - 1.5))))
        bar(f"arm_{i+1}_finger_{f}", h(start), h(end), .031, .024, skin, 10)
    bar(f"arm_{i+1}_thumb", h(Vector(c) + Vector((.08, -.015, -.03))), h(Vector(c) + Vector((.17, -.035, .07))), .045, .029, skin, 12)

# Tall ceremonial spear, back aureole, crown and copper jewelry.
bar("long_spear_staff", h((1.52, -.26, .58)), h((1.52, -.26, 4.45)), .038, .033, gold)
bar("forged_leaf_spearhead", h((1.52, -.26, 4.40)), h((1.52, -.26, 5.03)), .14, 0, edge, 4)
torus("spearhead_socket", h((1.52, -.26, 4.40)), .073, .025, gold)
torus("back_solar_aureole", h((0, .38, 3.48)), .83, .035, gold, (math.pi / 2, 0, 0))
for i in range(17):
    a = math.pi * i / 16
    bar("sun_ray", h((.84 * math.cos(a), .38, 3.48 + .84 * math.sin(a))),
        h((.99 * math.cos(a), .38, 3.48 + .99 * math.sin(a))), .035, .005, edge, 10)
torus("crown_band", h((0, 0, 4.02)), .285, .065, gold)
for i in range(9):
    a = math.tau * i / 9
    loc = h((.28 * math.cos(a), .24 * math.sin(a), 4.08))
    height = .39 + (.17 if i % 3 == 0 else 0)
    bar("crown_leaf", loc, (loc[0] * .0 + HX + .38 * math.cos(a), HY + .32 * math.sin(a), 4.08 + height), .082, 0, gold, 4)
torus("neck_torque", h((0, 0, 3.29)), .245, .05, gold)
for i in range(19):
    a = math.pi + math.pi * i / 18
    ell("beaded_necklace", h((.45 * math.cos(a), .28 * math.sin(a) - .04, 3.02 - .11 * math.sin(math.pi * i / 18))), (.047, .047, .047), gold, 12, 8)
ell("chest_medallion", h((0, -.38, 2.95)), (.13, .055, .16), gold)

# Pleated wrap mesh: alternate folds and an asymmetric indigo front sash.
verts, faces = [], []
for z, r in ((2.22, .45), (1.93, .51), (1.40, .70)):
    for i in range(64):
        a = math.tau * i / 64
        ripple = .045 * (1 if i % 2 else -1)
        verts.append(h(((r + ripple) * math.cos(a), (r * .64 + ripple) * math.sin(a), z + (.07 * math.sin(a * 3) if z < 1.5 else 0))))
for row in range(2):
    for i in range(64):
        j = (i + 1) % 64
        faces.append((row * 64 + i, row * 64 + j, (row + 1) * 64 + j, (row + 1) * 64 + i))
mesh = bpy.data.meshes.new("indigo_pleated_wrap")
mesh.from_pydata(verts, [], faces)
obj = bpy.data.objects.new("indigo_pleated_wrap", mesh)
HERO.objects.link(obj)
mesh.materials.append(indigo)
torus("waist_gold_belt", h((0, 0, 2.20)), .455, .065, gold)
for i in range(9):
    a = math.pi + math.pi * i / 8
    ell("belt_pendant", h((.47 * math.cos(a), .33 * math.sin(a), 2.05)), (.065, .042, .12), gold, 12, 8)
curve("indigo_sash_gold_border", [h((-.23, -.34, 2.17)), h((-.1, -.44, 1.86)), h((.12, -.47, 1.45)), h((.23, -.37, 1.18))], .04, gold)

# Stepped altar with radial lotus castings, orbital copper rings and faceted core.
CURRENT = ALTAR
AX, AY = 1.75, .75
for z, r, depth in ((.38, 1.19, .22), (.57, 1.03, .18), (.75, .86, .18), (.94, .68, .2)):
    cone("altar_circular_step", (AX, AY, z), r, depth, stone_top, r, 64)
    torus("altar_step_inlay", (AX, AY, z + depth / 2), r * .94, .025, gold)
for i in range(12):
    petal("lotus_outer_copper_petal", (AX, AY, 1.02), math.tau * i / 12, .78, .22, .47, gold)
for i in range(9):
    petal("lotus_inner_red_petal", (AX, AY, 1.12), math.tau * (i + .5) / 9, .46, .18, .67, skin)
cone("core_crystal_lower", (AX, AY, 1.82), 0, .7, crystal, .30, 6)
cone("core_crystal_upper", (AX, AY, 2.36), .30, .7, crystal, 0, 6)
for i in range(3):
    ring = torus("tilted_copper_orbit", (AX, AY, 2.04), .69 + .09 * i, .028, edge)
    ring.rotation_euler = (math.radians(61), math.radians(23 + i * 51), math.radians(i * 44))
for i in range(7):
    a = math.tau * i / 7
    pts = [(AX + r * math.cos(a + t), AY + r * math.sin(a + t), z)
           for r, t, z in ((.4, 0, 1.2), (.51, .1, 1.50), (.32, .28, 1.8), (.22, .5, 2.04))]
    curve("rising_altar_flame", pts, .045, flame)
for i in range(16):
    a = math.tau * i / 16
    ell("altar_bronze_rivet", (AX + .92 * math.cos(a), AY + .92 * math.sin(a), .68), (.045, .045, .045), edge, 12, 8)

# Floating basalt dais with engraved seams and sparse receding architectural shadows.
CURRENT = STAGE
cone("floating_octagonal_dais", (0, .4, -.13), 4.25, .52, stone, 4.10, 8)
cone("beveled_cut_stone_surface", (0, .4, .16), 4.10, .16, stone_top, 4.0, 8)
torus("dais_thin_bronze_perimeter", (0, .4, .254), 3.66, .025, gold)
for i in range(8):
    a = math.tau * i / 8
    curve("radial_floor_seam", [(.3 * math.cos(a), .4 + .3 * math.sin(a), .251),
                               (3.65 * math.cos(a), .4 + 3.65 * math.sin(a), .251)], .012, black)
for i, (x, y, height) in enumerate(((-3.0, 2.4, 2.3), (-1.3, 3.6, 1.6), (1.2, 3.7, 1.85), (3.1, 2.5, 2.6))):
    cone("distant_column_pedestal", (x, y, .43), .40, .34, stone, .36, 8)
    cone("distant_fluted_column", (x, y, height / 2 + .55), .23, height, stone, .19, 12)
    torus("column_neck_ring", (x, y, height + .4), .23, .06, gold)
    cone("weathered_column_cap", (x, y, height + .55), .35, .15, stone_top, .30, 8)

CURRENT = RIG


def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def camera(name, loc, target, scale):
    data = bpy.data.cameras.new(name)
    obj = bpy.data.objects.new(name, data)
    RIG.objects.link(obj)
    obj.location = loc
    data.type = "ORTHO"
    data.ortho_scale = scale
    aim(obj, target)
    return obj


beauty = camera("beauty_camera", (8, -13, 9.0), (0, .25, 2.10), 10.6)
game = camera("game_angle_camera", (7, -10, 15), (0, .35, 1.4), 10.8)


def area(name, loc, color, power, size, target):
    data = bpy.data.lights.new(name, "AREA")
    obj = bpy.data.objects.new(name, data)
    RIG.objects.link(obj)
    obj.location = loc
    data.energy, data.color, data.shape, data.size = power, color, "DISK", size
    aim(obj, target)


area("warm_key", (-4, -6, 9), (1, .67, .40), 1800, 5, (-1, 0, 2))
area("cool_fill", (5, -1, 6), (.32, .50, 1), 1300, 4, (0, 0, 2))
area("amber_rim", (-2, 5, 7), (1, .36, .11), 2100, 3, (-1, 0, 3))
area("front_face_softbox", (-1, -6, 5), (1, .82, .63), 420, 3, (-1.6, -.5, 3.7))
scene = bpy.context.scene
bpy.context.preferences.filepaths.save_version = 0
scene.world.color = (.035, .035, .035)
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (.025, .038, .070, 1)
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .34
scene.render.engine = "CYCLES"
scene.cycles.use_denoising = True
devices = []
prefs = bpy.context.preferences.addons["cycles"].preferences
try:
    prefs.compute_device_type = "OPTIX"
    prefs.get_devices()
    for device in prefs.devices:
        device.use = device.type == "OPTIX"
        devices.append({"name": device.name, "type": device.type, "enabled": bool(device.use)})
    scene.cycles.device = "GPU" if any(d["enabled"] for d in devices) else "CPU"
except Exception as exc:
    print("CYCLES_GPU_UNAVAILABLE", type(exc).__name__, str(exc))
    scene.cycles.device = "CPU"
print("RENDER_DEVICE", scene.cycles.device, json.dumps(devices))
draft = "--draft" in sys.argv
scene.cycles.samples = 24 if draft else 96
scene.render.resolution_x = 1100 if draft else 1600
scene.render.resolution_y = 1000 if draft else 1450
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "AgX"
scene.render.film_transparent = False
scene.render.image_settings.color_mode = "RGB"
scene.render.use_file_extension = True
scene.camera = beauty
scene["original_study"] = "Original six-armed copper Asura and lotus lightning altar; no external assets"
scene["device_discovery"] = json.dumps(devices)
scene["study_revision"] = "first sculptural study"

# Export only geometry; retain authoring curves in .blend and tessellate in GLB.
depsgraph = bpy.context.evaluated_depsgraph_get()
for obj in scene.objects:
    if obj.type in {"MESH", "CURVE"}:
        evaluated = obj.evaluated_get(depsgraph)
        check_mesh = evaluated.to_mesh()
        try:
            if any(not math.isfinite(x) for v in check_mesh.vertices for x in v.co):
                raise RuntimeError("Nonfinite evaluated mesh: " + obj.name)
        finally:
            evaluated.to_mesh_clear()
for obj in scene.objects:
    obj.select_set(obj.type in {"MESH", "CURVE"})
bpy.ops.export_scene.gltf(filepath=output("asura-altar.glb"), export_format="GLB",
                          use_selection=True, export_apply=True, export_yup=True,
                          export_cameras=False, export_lights=False)
bpy.ops.wm.save_as_mainfile(filepath=output("asura-altar.blend"))
for label, cam in (("beauty", beauty), ("game-angle", game)):
    scene.camera = cam
    scene.render.filepath = output(("initial-" if draft else "") + label + ".png")
    bpy.ops.render.render(write_still=True)
scene.camera = beauty
bpy.ops.wm.save_as_mainfile(filepath=output("asura-altar.blend"))
print("STUDY_RENDER_FINISHED", "draft" if draft else "final")
