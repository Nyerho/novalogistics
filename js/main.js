window.ShipmentManager = {
    getAllShipments: () => {
        const data = JSON.parse(localStorage.getItem('courier_shipments'));
        const shipments = Array.isArray(data) ? data : [];
        let mutated = false;
        const normalized = shipments.map((s) => {
            if (!s || typeof s !== 'object') return s;
            const copy = { ...s };

            if (typeof copy.paymentStatus !== 'string') {
                copy.paymentStatus = copy.isPaid ? 'Paid' : 'Unpaid';
                mutated = true;
            }
            if (!('paymentMethod' in copy)) {
                copy.paymentMethod = null;
                mutated = true;
            }
            if (typeof copy.isApproved !== 'boolean') {
                copy.isApproved = true;
                mutated = true;
            }
            if (typeof copy.isStopped !== 'boolean') {
                copy.isStopped = false;
                mutated = true;
            }
            if (!('stopReason' in copy)) {
                copy.stopReason = null;
                mutated = true;
            }
            if (!Array.isArray(copy.history)) {
                copy.history = [];
                mutated = true;
            }
            if (!Array.isArray(copy.route)) {
                copy.route = [];
                mutated = true;
            }
            return copy;
        });

        if (mutated) localStorage.setItem('courier_shipments', JSON.stringify(normalized));
        return normalized;
    },

    getShipment: (trackingId) => {
        const shipments = ShipmentManager.getAllShipments();
        return shipments.find(s => s.trackingId === trackingId);
    },

    saveShipment: (shipment) => {
        const shipments = ShipmentManager.getAllShipments();
        const index = shipments.findIndex(s => s.trackingId === shipment.trackingId);
        if (index >= 0) {
            shipments[index] = shipment;
        } else {
            shipments.push(shipment);
        }
        localStorage.setItem('courier_shipments', JSON.stringify(shipments));
    },

    generateTrackingId: () => {
        return 'TRK' + Math.floor(100000 + Math.random() * 900000);
    },

    generateUniqueTrackingId: () => {
        const existing = new Set(ShipmentManager.getAllShipments().map(s => s.trackingId));
        for (let i = 0; i < 50; i++) {
            const id = ShipmentManager.generateTrackingId();
            if (!existing.has(id)) return id;
        }
        return 'TRK' + Date.now();
    },

    createShipment: (data) => {
        const shipment = {
            trackingId: data.trackingId || ShipmentManager.generateUniqueTrackingId(),
            sender: data.sender,
            receiver: data.receiver,
            origin: data.origin,
            destination: data.destination,
            description: data.description || 'Standard Package',
            weight: data.weight || '1kg',
            isApproved: false,
            currentStatus: 'Awaiting Confirmation',
            cost: parseFloat(data.cost) || 0.00,
            isPaid: false,
            paymentStatus: 'Unpaid',
            paymentMethod: null,
            isStopped: false,
            stopReason: null,
            history: [
                { status: 'Request Created', location: data.origin, reason: null, timestamp: new Date().toLocaleString() }
            ],
            route: [data.origin, data.destination]
        };
        ShipmentManager.saveShipment(shipment);
        return shipment;
    },

    deleteShipment: (trackingId) => {
        let shipments = ShipmentManager.getAllShipments();
        shipments = shipments.filter(s => s.trackingId !== trackingId);
        localStorage.setItem('courier_shipments', JSON.stringify(shipments));
    },

    addUpdate: (trackingId, status, location, reason) => {
        const shipment = ShipmentManager.getShipment(trackingId);
        if (shipment) {
            shipment.currentStatus = status;
            if (status === 'On Hold') {
                shipment.isStopped = true;
                shipment.stopReason = reason || null;
                if (shipment.paymentStatus !== 'Paid') {
                    shipment.isPaid = false;
                    shipment.paymentStatus = 'Unpaid';
                    shipment.paymentMethod = null;
                }
            } else {
                shipment.isStopped = false;
                shipment.stopReason = null;
            }
            shipment.history.push({
                status: status,
                location: location,
                reason: reason || null,
                timestamp: new Date().toLocaleString()
            });
            // Add location to route if not already there (for simulation path)
            if (!shipment.route.includes(location)) {
                // Insert before destination
                shipment.route.splice(shipment.route.length - 1, 0, location);
            }
            ShipmentManager.saveShipment(shipment);
            return true;
        }
        return false;
    },

    payShipment: (trackingId, method) => {
        const shipment = ShipmentManager.getShipment(trackingId);
        if (shipment) {
            shipment.isPaid = false;
            shipment.paymentStatus = 'Processing';
            shipment.paymentMethod = method;
            ShipmentManager.saveShipment(shipment);
            return true;
        }
        return false;
    },

    confirmPayment: (trackingId) => {
        const shipment = ShipmentManager.getShipment(trackingId);
        if (shipment) {
            shipment.isPaid = true;
            shipment.paymentStatus = 'Paid';
            if (shipment.isStopped) {
                shipment.isStopped = false;
                shipment.stopReason = null;
                if (shipment.currentStatus === 'On Hold') {
                    shipment.currentStatus = 'In Transit';
                }
                const lastLoc = shipment.history && shipment.history.length ? shipment.history[shipment.history.length - 1].location : shipment.origin;
                shipment.history.push({
                    status: 'Payment Confirmed',
                    location: lastLoc,
                    reason: null,
                    timestamp: new Date().toLocaleString()
                });
            }
            ShipmentManager.saveShipment(shipment);
            return true;
        }
        return false;
    },

    updatePaymentInfo: (trackingId, paymentStatus, paymentMethod) => {
        const shipment = ShipmentManager.getShipment(trackingId);
        if (!shipment) return false;
        shipment.paymentStatus = paymentStatus || 'Unpaid';
        shipment.paymentMethod = paymentMethod || null;
        shipment.isPaid = shipment.paymentStatus === 'Paid';
        ShipmentManager.saveShipment(shipment);
        return true;
    },

    confirmShipment: (trackingId, cost) => {
        const shipment = ShipmentManager.getShipment(trackingId);
        if (!shipment) return false;
        shipment.isApproved = true;
        shipment.cost = typeof cost === 'number' && !Number.isNaN(cost) ? cost : shipment.cost;
        shipment.currentStatus = 'In Transit';
        shipment.history.push({
            status: 'Order Confirmed',
            location: shipment.origin,
            reason: null,
            timestamp: new Date().toLocaleString()
        });
        ShipmentManager.saveShipment(shipment);
        return true;
    }
};

const Simulation = {
    start: (route, elementId, options) => {
        const container = document.getElementById(elementId);
        if (!container) return;
        
        if (container.dataset.simTimer) {
            clearTimeout(Number(container.dataset.simTimer));
            delete container.dataset.simTimer;
        }

        container.innerHTML = '';
        
        const width = container.offsetWidth;
        const height = container.offsetHeight;
        const padding = 50;
        
        const safeRoute = Array.isArray(route) ? route.filter(Boolean) : [];
        if (safeRoute.length === 0) return;

        if (window.L) {
            MapSimulation.start(safeRoute, elementId, options);
            return;
        }

        const points = safeRoute.map((loc, index) => {
            const denom = Math.max(safeRoute.length - 1, 1);
            const progress = index / denom;
            const x = padding + (width - 2 * padding) * progress;
            const y = height / 2;
            return { x, y, name: loc };
        });

        points.forEach((point, index) => {
            const pointEl = document.createElement('div');
            pointEl.className = 'map-point';
            pointEl.style.left = point.x + 'px';
            pointEl.style.top = point.y + 'px';
            pointEl.title = point.name;
            container.appendChild(pointEl);

            const label = document.createElement('div');
            label.innerText = point.name;
            label.style.position = 'absolute';
            label.style.left = point.x + 'px';
            label.style.top = (point.y + 15) + 'px';
            label.style.transform = 'translateX(-50%)';
            label.style.fontSize = '12px';
            container.appendChild(label);

            if (index < points.length - 1) {
                const next = points[index+1];
                const line = document.createElement('div');
                line.className = 'map-line';
                line.style.left = point.x + 'px';
                line.style.top = point.y + 'px';
                line.style.width = (next.x - point.x) + 'px';
                container.appendChild(line);
            }
        });

        const truck = document.createElement('div');
        truck.className = 'truck-icon';
        truck.innerHTML = '🚚';
        container.appendChild(truck);

        const pauseAtIndex = options && typeof options.pauseAtIndex === 'number' ? options.pauseAtIndex : null;
        const clampedPauseAtIndex = pauseAtIndex === null ? null : Math.min(Math.max(pauseAtIndex, 0), points.length - 1);
        let currentPointIndex = clampedPauseAtIndex !== null ? clampedPauseAtIndex : 0;
        
        const moveTruck = () => {
            if (clampedPauseAtIndex !== null) {
                const p = points[clampedPauseAtIndex];
                truck.style.left = p.x + 'px';
                truck.style.top = p.y + 'px';
                return;
            }
            if (currentPointIndex >= points.length) {
                const p = points[points.length - 1];
                truck.style.left = p.x + 'px';
                truck.style.top = p.y + 'px';
                return;
            }
            const point = points[currentPointIndex];
            truck.style.left = point.x + 'px';
            truck.style.top = point.y + 'px';
            currentPointIndex++;
            const t = setTimeout(moveTruck, 3500);
            container.dataset.simTimer = String(t);
        };
        
        moveTruck();
    }
};

const MapSimulation = {
    start: (route, elementId, options) => {
        const container = document.getElementById(elementId);
        if (!container || !window.L) return;

        if (container._leaflet) {
            try {
                container._leaflet.map.remove();
            } catch (e) {}
            container._leaflet = null;
        }
        if (container._moveTimer) {
            clearInterval(container._moveTimer);
            container._moveTimer = null;
        }

        const map = window.L.map(container, { zoomControl: false, attributionControl: false }).setView([20, 0], 2);
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

        const pauseAtIndex = options && typeof options.pauseAtIndex === 'number' ? options.pauseAtIndex : null;
        const clampedPauseAtIndex = pauseAtIndex === null ? null : Math.min(Math.max(pauseAtIndex, 0), route.length - 1);

        const getCache = () => JSON.parse(localStorage.getItem('courier_geocode_cache') || '{}');
        const setCache = (cache) => localStorage.setItem('courier_geocode_cache', JSON.stringify(cache));

        const pseudoCoords = (name) => {
            let h = 0;
            for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
            const lat = ((h % 14000) / 100) - 70;
            const lng = (((h / 14000) % 36000) / 100) - 180;
            return [lat, lng];
        };

        const geocode = async (name) => {
            const q = String(name || '').trim();
            if (!q) return null;
            const cache = getCache();
            if (cache[q]) return cache[q];
            try {
                const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
                const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
                const json = await res.json();
                const item = Array.isArray(json) && json.length ? json[0] : null;
                if (item && item.lat && item.lon) {
                    const coords = [parseFloat(item.lat), parseFloat(item.lon)];
                    cache[q] = coords;
                    setCache(cache);
                    return coords;
                }
            } catch (e) {}
            const coords = pseudoCoords(q);
            const cache2 = getCache();
            cache2[q] = coords;
            setCache(cache2);
            return coords;
        };

        (async () => {
            const coords = [];
            for (const loc of route) {
                const c = await geocode(loc);
                if (c) coords.push(c);
            }
            if (!coords.length) return;

            const poly = window.L.polyline(coords, { color: '#0a4b78', weight: 4, opacity: 0.85 }).addTo(map);
            map.fitBounds(poly.getBounds(), { padding: [24, 24] });

            const startMarker = window.L.circleMarker(coords[0], { radius: 6, color: '#f28a1b', fillColor: '#f28a1b', fillOpacity: 1 }).addTo(map);
            startMarker.bindTooltip(route[0], { permanent: false });

            const endMarker = window.L.circleMarker(coords[coords.length - 1], { radius: 6, color: '#08a6c9', fillColor: '#08a6c9', fillOpacity: 1 }).addTo(map);
            endMarker.bindTooltip(route[route.length - 1], { permanent: false });

            const truckIcon = window.L.divIcon({ className: 'leaflet-truck', html: '<div class="truck-badge">🚚</div>', iconSize: [28, 28], iconAnchor: [14, 14] });
            const marker = window.L.marker(coords[0], { icon: truckIcon }).addTo(map);

            if (clampedPauseAtIndex !== null) {
                marker.setLatLng(coords[clampedPauseAtIndex] || coords[0]);
                return;
            }

            let idx = 0;
            let t = 0;
            const stepMs = 1100;
            const segSteps = 12;

            container._moveTimer = setInterval(() => {
                if (idx >= coords.length - 1) {
                    clearInterval(container._moveTimer);
                    container._moveTimer = null;
                    marker.setLatLng(coords[coords.length - 1]);
                    return;
                }
                const a = coords[idx];
                const b = coords[idx + 1];
                t += 1;
                const p = Math.min(t / segSteps, 1);
                const lat = a[0] + (b[0] - a[0]) * p;
                const lng = a[1] + (b[1] - a[1]) * p;
                marker.setLatLng([lat, lng]);
                if (p >= 1) {
                    idx += 1;
                    t = 0;
                }
            }, stepMs);
        })();

        container._leaflet = { map };
    }
};
