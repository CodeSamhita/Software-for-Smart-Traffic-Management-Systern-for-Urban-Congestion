export function createRenderer({ ctx, state, config, COLORS, DIR, DIRECTIONS, LIGHT, trafficLights, clamp }) {
    function drawRoads() {
        ctx.fillStyle = COLORS.grass;
        ctx.fillRect(-state.width, -state.height, state.width * 3, state.height * 3);
        const rw = config.roadWidth;
        const hw = rw / 2;
        const lw = config.laneWidth;

        ctx.fillStyle = COLORS.road;
        ctx.fillRect(0, state.cy - hw, state.width, rw);
        ctx.fillRect(state.cx - hw, 0, rw, state.height);
        ctx.fillStyle = "rgba(15, 23, 42, 0.34)";
        ctx.fillRect(state.cx - hw - 10, state.cy - hw - 10, rw + 20, rw + 20);

        function gapLine(x1, y1, x2, y2, dashed) {
            ctx.beginPath();
            ctx.setLineDash(dashed ? [15, 15] : []);
            if (y1 === y2) {
                if (x1 < state.cx) {
                    x2 = Math.min(x2, state.cx - hw);
                } else {
                    x1 = Math.max(x1, state.cx + hw);
                }
            } else if (y1 < state.cy) {
                y2 = Math.min(y2, state.cy - hw);
            } else {
                y1 = Math.max(y1, state.cy + hw);
            }
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        ctx.strokeStyle = COLORS.median;
        ctx.lineWidth = 2;
        gapLine(0, state.cy - 2, state.cx - hw, state.cy - 2, false);
        gapLine(0, state.cy + 2, state.cx - hw, state.cy + 2, false);
        gapLine(state.cx + hw, state.cy - 2, state.width, state.cy - 2, false);
        gapLine(state.cx + hw, state.cy + 2, state.width, state.cy + 2, false);
        gapLine(state.cx - 2, 0, state.cx - 2, state.cy - hw, false);
        gapLine(state.cx + 2, 0, state.cx + 2, state.cy - hw, false);
        gapLine(state.cx - 2, state.cy + hw, state.cx - 2, state.height, false);
        gapLine(state.cx + 2, state.cy + hw, state.cx + 2, state.height, false);

        ctx.strokeStyle = COLORS.mark;
        ctx.lineWidth = 2;
        for (let i = 1; i < config.lanesPerDir; i += 1) {
            const offset = i * lw;
            gapLine(0, state.cy - offset, state.cx - hw, state.cy - offset, true);
            gapLine(state.cx + hw, state.cy - offset, state.width, state.cy - offset, true);
            gapLine(0, state.cy + offset, state.cx - hw, state.cy + offset, true);
            gapLine(state.cx + hw, state.cy + offset, state.width, state.cy + offset, true);
            gapLine(state.cx - offset, 0, state.cx - offset, state.cy - hw, true);
            gapLine(state.cx - offset, state.cy + hw, state.cx - offset, state.height, true);
            gapLine(state.cx + offset, 0, state.cx + offset, state.cy - hw, true);
            gapLine(state.cx + offset, state.cy + hw, state.cx + offset, state.height, true);
        }

        ctx.strokeStyle = COLORS.edge;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, state.cy - hw);
        ctx.lineTo(state.cx - hw, state.cy - hw);
        ctx.moveTo(state.cx + hw, state.cy - hw);
        ctx.lineTo(state.width, state.cy - hw);
        ctx.moveTo(0, state.cy + hw);
        ctx.lineTo(state.cx - hw, state.cy + hw);
        ctx.moveTo(state.cx + hw, state.cy + hw);
        ctx.lineTo(state.width, state.cy + hw);
        ctx.moveTo(state.cx - hw, 0);
        ctx.lineTo(state.cx - hw, state.cy - hw);
        ctx.moveTo(state.cx - hw, state.cy + hw);
        ctx.lineTo(state.cx - hw, state.height);
        ctx.moveTo(state.cx + hw, 0);
        ctx.lineTo(state.cx + hw, state.cy - hw);
        ctx.moveTo(state.cx + hw, state.cy + hw);
        ctx.lineTo(state.cx + hw, state.height);
        ctx.stroke();

        ctx.setLineDash([8, 12]);
        ctx.strokeStyle = "rgba(148, 163, 184, 0.75)";
        ctx.lineWidth = 2;
        const radius = Math.max(14, lw * 0.52);
        const corner = hw;
        ctx.beginPath();
        ctx.arc(state.cx - corner, state.cy - corner, radius, 0, Math.PI / 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(state.cx + corner, state.cy - corner, radius, Math.PI / 2, Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(state.cx + corner, state.cy + corner, radius, Math.PI, Math.PI * 1.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(state.cx - corner, state.cy + corner, radius, Math.PI * 1.5, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        const heat = state.metrics.corridors;
        const boxShort = Math.round(lw * 1.5);
        const boxLong = Math.round(lw * 2.8);
        const boxGap = Math.round(lw * 0.38);
        const boxes = {
            [DIR.NORTH]: { x: state.cx - boxShort / 2, y: state.cy + hw + boxGap, w: boxShort, h: boxLong },
            [DIR.SOUTH]: { x: state.cx - boxShort / 2, y: state.cy - hw - boxLong - boxGap, w: boxShort, h: boxLong },
            [DIR.EAST]: { x: state.cx - hw - boxLong - boxGap, y: state.cy - boxShort / 2, w: boxLong, h: boxShort },
            [DIR.WEST]: { x: state.cx + hw + boxGap, y: state.cy - boxShort / 2, w: boxLong, h: boxShort },
        };

        for (const dir of DIRECTIONS) {
            const rect = boxes[dir];
            const intensity = clamp(heat[dir].pressure / 16, 0, 1);
            ctx.fillStyle = `rgba(251, 113, 133, ${0.12 + intensity * 0.25})`;
            ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
            if (state.activeEmergencyRequest && state.activeEmergencyRequest.direction === dir) {
                ctx.strokeStyle = "rgba(253, 224, 71, 0.85)";
                ctx.lineWidth = 2;
                ctx.strokeRect(rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4);
            }
        }

        ctx.strokeStyle = "#f8fafc";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(state.cx - hw, state.cy - hw);
        ctx.lineTo(state.cx - hw, state.cy);
        ctx.moveTo(state.cx + hw, state.cy);
        ctx.lineTo(state.cx + hw, state.cy + hw);
        ctx.moveTo(state.cx - hw, state.cy + hw);
        ctx.lineTo(state.cx, state.cy + hw);
        ctx.moveTo(state.cx, state.cy - hw);
        ctx.lineTo(state.cx + hw, state.cy - hw);
        ctx.stroke();
    }

    function drawTrafficLights() {
        const offset = config.roadWidth / 2 + 18;

        function housing(x, y, rotation) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(rotation);
            ctx.fillStyle = "#0f172a";
            ctx.fillRect(-7, -21, 14, 42);
            ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
            ctx.strokeRect(-7, -21, 14, 42);
            ctx.restore();
        }

        function bulb(x, y, color, active) {
            ctx.beginPath();
            ctx.arc(x, y, 4.3, 0, Math.PI * 2);
            ctx.fillStyle = active ? color : "#334155";
            ctx.shadowColor = active ? color : "transparent";
            ctx.shadowBlur = active ? 16 : 0;
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        housing(state.cx - offset, state.cy - offset, 0);
        housing(state.cx + offset, state.cy - offset, Math.PI / 2);
        housing(state.cx + offset, state.cy + offset, Math.PI);
        housing(state.cx - offset, state.cy + offset, -Math.PI / 2);

        const east = trafficLights.lights[DIR.EAST];
        bulb(state.cx - offset, state.cy - offset - 10, COLORS.red, east === LIGHT.RED);
        bulb(state.cx - offset, state.cy - offset, COLORS.yellow, east === LIGHT.YELLOW);
        bulb(state.cx - offset, state.cy - offset + 10, COLORS.green, east === LIGHT.GREEN);

        const west = trafficLights.lights[DIR.WEST];
        bulb(state.cx + offset, state.cy + offset + 10, COLORS.red, west === LIGHT.RED);
        bulb(state.cx + offset, state.cy + offset, COLORS.yellow, west === LIGHT.YELLOW);
        bulb(state.cx + offset, state.cy + offset - 10, COLORS.green, west === LIGHT.GREEN);

        const south = trafficLights.lights[DIR.SOUTH];
        bulb(state.cx + offset + 10, state.cy - offset, COLORS.red, south === LIGHT.RED);
        bulb(state.cx + offset, state.cy - offset, COLORS.yellow, south === LIGHT.YELLOW);
        bulb(state.cx + offset - 10, state.cy - offset, COLORS.green, south === LIGHT.GREEN);

        const north = trafficLights.lights[DIR.NORTH];
        bulb(state.cx - offset - 10, state.cy + offset, COLORS.red, north === LIGHT.RED);
        bulb(state.cx - offset, state.cy + offset, COLORS.yellow, north === LIGHT.YELLOW);
        bulb(state.cx - offset + 10, state.cy + offset, COLORS.green, north === LIGHT.GREEN);
    }

    function drawCommunicationOverlay() {
        for (const vehicle of state.vehicles) {
            if (!vehicle.priority || vehicle.state === "DONE" || !vehicle.emergencyProfile) {
                continue;
            }
            const radius = vehicle.emergencyProfile.broadcastRadius * 0.45;
            const pulse = 0.22 + Math.abs(Math.sin(state.time / 260)) * 0.12;

            ctx.save();
            ctx.setLineDash([12, 10]);
            ctx.strokeStyle = `rgba(56, 189, 248, ${pulse})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(vehicle.x, vehicle.y, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }
    }

    function drawBackdrop() {
        const sky = ctx.createLinearGradient(0, 0, 0, state.height);
        sky.addColorStop(0, "#0a1623");
        sky.addColorStop(0.55, "#102334");
        sky.addColorStop(1, "#07131d");
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, state.width, state.height);

        const glow = ctx.createRadialGradient(
            state.cx,
            state.cy,
            40,
            state.cx,
            state.cy,
            Math.max(state.width, state.height) * 0.55
        );
        glow.addColorStop(0, "rgba(56, 189, 248, 0.10)");
        glow.addColorStop(1, "rgba(56, 189, 248, 0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, state.width, state.height);
    }

    function drawSimulation() {
        drawBackdrop();
        drawRoads();
        for (const vehicle of state.vehicles) {
            vehicle.draw();
        }
        drawCommunicationOverlay();
        drawTrafficLights();
    }

    return { drawSimulation };
}
