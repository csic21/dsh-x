#!/usr/bin/env python3
"""Render the bundled DSH pet as a Codex-compatible v2 sprite atlas.

The output follows the Codex pet contract byte-for-byte: 1536x2288 PNG,
8 columns x 11 rows, 192x208 cells, transparent background, row order
idle / running-right / running-left / waving / jumping / failed / waiting /
running / review / look-A / look-B, with the documented frame counts.

Everything is drawn procedurally; no third-party artwork is copied.

    python3 scripts/pet-atlas.py packages/dsh-x-pet/assets/default-pet
"""

import math
import os
import sys

from PIL import Image, ImageDraw

SCALE = 4
CELL_W, CELL_H = 192, 208
COLUMNS, ROWS = 8, 11

INK = (30, 27, 75, 255)
BODY = (99, 102, 241, 255)
BODY_DARK = (67, 56, 202, 255)
BODY_LIGHT = (165, 180, 252, 255)
BELLY = (224, 231, 255, 255)
EYE = (255, 255, 255, 255)
PUPIL = (17, 24, 39, 255)
CHEEK = (244, 114, 182, 190)
SPARK = (251, 191, 36, 255)
SPARK_GLOW = (253, 224, 71, 110)
MOUTH = (30, 27, 75, 255)
TONGUE = (248, 113, 113, 255)


def s(value):
    return int(round(value * SCALE))


def ellipse(draw, cx, cy, rx, ry, fill):
    draw.ellipse((s(cx - rx), s(cy - ry), s(cx + rx), s(cy + ry)), fill=fill)


def rounded(draw, x0, y0, x1, y1, radius, fill, outline=None, width=0):
    if outline is not None:
        w = width
        draw.rounded_rectangle((s(x0 - w), s(y0 - w), s(x1 + w), s(y1 + w)), radius=s(radius + w), fill=outline)
    draw.rounded_rectangle((s(x0), s(y0), s(x1), s(y1)), radius=s(radius), fill=fill)


def limb(draw, start, end, radius, fill, outline=None, width=2.6):
    """A capsule, optionally with a dark outline: outline stroke first, then the fill."""
    ax, ay = s(start[0]), s(start[1])
    bx, by = s(end[0]), s(end[1])
    r, w = s(radius), s(width)
    strokes = ((outline, w), (fill, 0)) if outline else ((fill, 0),)
    for color, grow in strokes:
        draw.line((ax, ay, bx, by), fill=color, width=int(round(2 * (r + grow))))
        draw.ellipse((ax - r - grow, ay - r - grow, ax + r + grow, ay + r + grow), fill=color)
        draw.ellipse((bx - r - grow, by - r - grow, bx + r + grow, by + r + grow), fill=color)


def eye(draw, cx, cy, gaze, state):
    if state == 'blink':
        limb(draw, (cx - 8.5, cy), (cx + 8.5, cy), 2.2, INK, outline=INK, width=0)
        return
    if state == 'x':
        for sign in (-1, 1):
            limb(draw, (cx - 6.5, cy - 6.5 * sign), (cx + 6.5, cy + 6.5 * sign), 2.2, INK, outline=INK, width=0)
        return
    if state == 'happy':
        draw.arc((s(cx - 9.5), s(cy - 7), s(cx + 9.5), s(cy + 7)), 200, 340, fill=INK, width=s(3.2))
        return
    if state == 'squint':
        draw.arc((s(cx - 9), s(cy - 2), s(cx + 9), s(cy + 9)), 200, 340, fill=INK, width=s(3.2))
        return
    rx, ry = (13.0, 13.0) if state != 'wide' else (13.8, 14.4)
    ellipse(draw, cx, cy, rx + 2.2, ry + 2.2, INK)
    ellipse(draw, cx, cy, rx, ry, EYE)
    pr = 6.2 if state != 'wide' else 6.6
    gx = cx + gaze[0] * 5.0
    gy = cy + gaze[1] * 5.0
    ellipse(draw, gx, gy, pr, pr, PUPIL)
    ellipse(draw, gx - 2.1, gy - 2.4, 1.9, 1.9, (255, 255, 255, 240))


def mouth(draw, cx, cy, kind):
    if kind == 'smile':
        draw.arc((s(cx - 8), s(cy - 3), s(cx + 8), s(cy + 9)), 20, 160, fill=MOUTH, width=s(2.6))
    elif kind == 'flat':
        limb(draw, (cx - 7, cy + 3), (cx + 7, cy + 3), 1.9, MOUTH, outline=MOUTH, width=0)
    elif kind == 'open':
        ellipse(draw, cx, cy + 4, 6.4, 7.4, MOUTH)
        ellipse(draw, cx, cy + 7, 4.0, 3.4, TONGUE)
    elif kind == 'o':
        ellipse(draw, cx, cy + 4, 4.6, 5.6, MOUTH)
    elif kind == 'frown':
        draw.arc((s(cx - 8), s(cy + 4), s(cx + 8), s(cy + 16)), 200, 340, fill=MOUTH, width=s(2.6))


def creature(draw, *, lift=0.0, lean=0.0, squash=1.0, gaze=(0.0, 0.0), eyes=('open', 'open'),
             arm_left=8.0, arm_right=8.0, foot=0.0, antenna=0.0, mouth_kind='smile', hop=0.0):
    """Draw one pose inside a 192x208 cell.

    `lift` moves the whole character up (negative) or down (positive);
    `squash` < 1 widens and shortens the body (landing), > 1 stretches it.
    `arm_left` / `arm_right` are degrees from horizontal, positive = downward.
    """
    sway = math.sin(math.radians(lean)) * 10
    stretch = 1.0 / squash
    body_w = 55 * stretch
    body_h = 55 * squash
    cx = 96 + sway
    cy = 112 + lift
    ground = cy + body_h + 18

    # feet, drawn before the body so the silhouette stays joined
    for index, side in enumerate((-1, 1)):
        swing = foot if index == 0 else -foot
        fx = cx + side * 21 + swing * 0.8
        fy = ground - abs(swing) * 0.3 + hop
        rounded(draw, fx - 13, fy - 11, fx + 13, fy + 6, 8, BODY_DARK, outline=INK, width=2.2)

    # antenna
    tip_x = cx + math.sin(math.radians(antenna)) * 16
    tip_y = cy - body_h - 12 - math.cos(math.radians(antenna)) * 5
    limb(draw, (cx, cy - body_h + 6), (tip_x, tip_y + 5), 2.3, BODY_DARK, width=2.0)
    ellipse(draw, tip_x, tip_y, 11, 11, SPARK_GLOW)
    ellipse(draw, tip_x, tip_y, 6.6, 6.6, SPARK)
    ellipse(draw, tip_x - 1.8, tip_y - 2.0, 1.9, 1.9, (255, 255, 255, 220))

    # body
    rounded(draw, cx - body_w, cy - body_h, cx + body_w, cy + body_h, 46, BODY, outline=INK, width=3.2)
    # soft top highlight and belly, both kept inside the body
    draw.arc((s(cx - body_w + 12), s(cy - body_h + 6), s(cx + body_w - 12), s(cy - body_h + 52)),
             205, 268, fill=BODY_LIGHT, width=s(7))
    rounded(draw, cx - 27, cy + 14, cx + 27, cy + body_h - 12, 16, BELLY)

    # arms, after the body so a raised arm is never hidden
    for side, angle in ((-1, arm_left), (1, arm_right)):
        radians = math.radians(angle)
        shoulder = (cx + side * (body_w - 8), cy + 6)
        reach = 22 + abs(math.sin(radians)) * 6
        hand = (shoulder[0] + side * math.cos(radians) * reach, shoulder[1] + math.sin(radians) * reach)
        limb(draw, shoulder, hand, 6.6, BODY_DARK, width=2.4)

    # face
    face_y = cy - 20
    for index, side in enumerate((-1, 1)):
        eye(draw, cx + side * 19, face_y, gaze, eyes[index])
    for side in (-1, 1):
        ellipse(draw, cx + side * 37, face_y + 17, 7.2, 4.6, CHEEK)
    mouth(draw, cx, face_y + 14, mouth_kind)


def render(pose):
    canvas = Image.new('RGBA', (s(CELL_W), s(CELL_H)), (0, 0, 0, 0))
    pose(ImageDraw.Draw(canvas))
    return canvas.resize((CELL_W, CELL_H), Image.LANCZOS)


# --- rows -------------------------------------------------------------------

def idle_frames():
    frames = []
    for index, bob in enumerate([0, -1.5, -2.4, -1.8, -0.6, 0]):
        blink = index == 4
        frames.append(render(lambda d, b=bob, k=blink: creature(
            d, lift=b, gaze=(0.0, 0.0), eyes=('blink', 'blink') if k else ('open', 'open'),
            arm_left=52 + b * 0.8, arm_right=52 + b * 0.8, antenna=4 + b * 1.6)))
    return frames


def run_frames(direction):
    frames = []
    for index in range(8):
        phase = index / 8 * math.tau
        swing = math.sin(phase)
        frames.append(render(lambda d, p=phase, g=swing: creature(
            d, lift=-2.2 * abs(g), lean=10 * direction, foot=7 * g,
            gaze=(0.55 * direction, 0.05), arm_left=26 * g + 44, arm_right=-26 * g + 44,
            antenna=14 * direction + 4 * g, squash=1 + 0.035 * math.sin(p * 2))))
    return frames


def waving_frames():
    # start, raised gesture, hold, return
    poses = [(-0.5, 22), (-1.5, -62), (-1.8, -74), (-0.4, 30)]
    frames = []
    for lift, angle in poses:
        frames.append(render(lambda d, l=lift, a=angle: creature(
            d, lift=l, lean=-3, arm_right=a, arm_left=52, gaze=(0.35, -0.15),
            eyes=('happy', 'happy'), mouth_kind='smile', antenna=10)))
    return frames


def jumping_frames():
    # anticipation, lift, peak, descent, settle
    poses = [
        (2.5, 1.10, 0, 26),
        (-18, 1.02, -30, 62),
        (-40, 1.0, -44, 74),
        (-16, 1.03, -26, 54),
        (1.5, 1.06, 0, 18),
    ]
    frames = []
    for lift, squash, hop, arm in poses:
        airborne = lift < -10
        frames.append(render(lambda d, l=lift, q=squash, h=hop, a=arm, air=airborne: creature(
            d, lift=l, hop=h, squash=q, arm_left=a - 90, arm_right=a - 90, gaze=(0.0, -0.35),
            eyes=('wide', 'wide'), mouth_kind='open' if air else 'smile', antenna=24 if air else 6)))
    return frames


def failed_frames():
    frames = []
    for index in range(8):
        droop = 4 + index * 0.6
        frames.append(render(lambda d, dr=droop: creature(
            d, lift=dr, squash=0.94, eyes=('x', 'x'), mouth_kind='frown',
            arm_left=62, arm_right=62, antenna=46, gaze=(0.0, 0.45))))
    return frames


def waiting_frames():
    frames = []
    for index in range(6):
        bob = -1.6 * abs(math.sin(index / 6 * math.tau))
        frames.append(render(lambda d, b=bob: creature(
            d, lift=b, gaze=(0.0, -0.6), eyes=('open', 'open'), mouth_kind='smile',
            arm_left=-58, arm_right=-58, antenna=-16, squash=1.02)))
    return frames


def working_frames():
    frames = []
    for index in range(6):
        phase = index / 6 * math.tau
        gaze = (-0.7, 0.35) if index % 2 == 0 else (0.7, 0.35)
        frames.append(render(lambda d, p=phase, g=gaze: creature(
            d, lift=-0.8 * abs(math.sin(p)), lean=4, gaze=g, eyes=('squint', 'squint'),
            mouth_kind='flat', arm_left=24 + 7 * math.sin(p * 2), arm_right=24 - 7 * math.sin(p * 2),
            antenna=16, squash=1.01)))
    return frames


def review_frames():
    frames = []
    for index in range(6):
        phase = index / 6 * math.tau
        frames.append(render(lambda d, p=phase: creature(
            d, lift=-0.8, lean=7, gaze=(0.45, 0.15),
            eyes=('blink', 'blink') if index == 3 else ('open', 'open'),
            mouth_kind='smile', arm_left=-62, arm_right=44 + 7 * math.sin(p), antenna=8)))
    return frames


def look_frames(offset):
    frames = []
    for index in range(8):
        angle = (offset + index) * 22.5
        radians = math.radians(angle)
        # 000 degrees looks up; screen space puts up at negative y.
        gaze = (math.sin(radians), -math.cos(radians))
        frames.append(render(lambda d, g=gaze: creature(
            d, lift=-0.6, lean=g[0] * 5, gaze=g, eyes=('open', 'open'), mouth_kind='smile',
            arm_left=52, arm_right=52, antenna=g[0] * 12, squash=1.0)))
    return frames


ROWS = [
    ('idle', idle_frames),
    ('running-right', lambda: run_frames(1)),
    ('running-left', lambda: run_frames(-1)),
    ('waving', waving_frames),
    ('jumping', jumping_frames),
    ('failed', failed_frames),
    ('waiting', waiting_frames),
    ('running', working_frames),
    ('review', review_frames),
    ('look-a', lambda: look_frames(0)),
    ('look-b', lambda: look_frames(8)),
]


def build(destination):
    atlas = Image.new('RGBA', (CELL_W * COLUMNS, CELL_H * ROWS.__len__()), (0, 0, 0, 0))
    for row, (name, make) in enumerate(ROWS):
        frames = make()
        assert len(frames) <= COLUMNS, name
        for column, frame in enumerate(frames):
            atlas.paste(frame, (column * CELL_W, row * CELL_H), frame)
    os.makedirs(destination, exist_ok=True)
    atlas.save(os.path.join(destination, 'spritesheet.png'), optimize=True)
    atlas.save(os.path.join(destination, 'spritesheet.webp'), quality=92, method=6)
    print('wrote', os.path.join(destination, 'spritesheet.webp'), atlas.size)


if __name__ == '__main__':
    build(sys.argv[1] if len(sys.argv) > 1 else 'packages/dsh-x-pet/assets/default-pet')
