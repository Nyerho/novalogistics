const FirebaseStore = {
    _initialized: false,
    _enabled: false,
    _db: null,

    init: () => {
        if (FirebaseStore._initialized) return FirebaseStore._enabled;
        FirebaseStore._initialized = true;

        if (!window.firebase || !window.firebase.initializeApp || !window.firebase.firestore) {
            FirebaseStore._enabled = false;
            return false;
        }

        try {
            if (!window.firebase.apps || window.firebase.apps.length === 0) {
                window.firebase.initializeApp({
                    apiKey: "AIzaSyAWYvxLeeqjW23t6bSorvWUJWE4Sd4BMRk",
                    authDomain: "novalogistics-dc376.firebaseapp.com",
                    projectId: "novalogistics-dc376",
                    storageBucket: "novalogistics-dc376.firebasestorage.app",
                    messagingSenderId: "645945966121",
                    appId: "1:645945966121:web:7a5ccf9975a971272da638",
                    measurementId: "G-N8N9R0ML2N"
                });
            }
            FirebaseStore._db = window.firebase.firestore();
            FirebaseStore._enabled = true;
            return true;
        } catch (e) {
            FirebaseStore._enabled = false;
            return false;
        }
    },

    enabled: () => {
        return FirebaseStore.init();
    },

    shipmentsCol: () => {
        if (!FirebaseStore.enabled()) return null;
        return FirebaseStore._db.collection('shipments');
    },

    upsertShipment: async (shipment) => {
        const col = FirebaseStore.shipmentsCol();
        if (!col || !shipment || !shipment.trackingId) return false;
        try {
            await col.doc(String(shipment.trackingId)).set(shipment, { merge: true });
            return true;
        } catch (e) {
            return false;
        }
    },

    deleteShipment: async (trackingId) => {
        const col = FirebaseStore.shipmentsCol();
        if (!col) return false;
        try {
            await col.doc(String(trackingId)).delete();
            return true;
        } catch (e) {
            return false;
        }
    },

    subscribeAll: (onChange) => {
        const col = FirebaseStore.shipmentsCol();
        if (!col) return null;
        try {
            return col.onSnapshot((snap) => {
                const rows = [];
                snap.forEach((doc) => {
                    const data = doc.data();
                    if (data) rows.push(data);
                });
                onChange(rows);
            });
        } catch (e) {
            return null;
        }
    },

    subscribeOne: (trackingId, onChange) => {
        const col = FirebaseStore.shipmentsCol();
        if (!col) return null;
        try {
            return col.doc(String(trackingId)).onSnapshot((doc) => {
                const data = doc.exists ? doc.data() : null;
                onChange(data);
            });
        } catch (e) {
            return null;
        }
    },

    docRef: (docPath) => {
        if (!FirebaseStore.enabled()) return null;
        const parts = String(docPath || '').split('/').filter(Boolean);
        if (parts.length < 2 || parts.length % 2 !== 0) return null;
        let ref = FirebaseStore._db;
        for (let i = 0; i < parts.length; i += 2) {
            ref = ref.collection(parts[i]).doc(parts[i + 1]);
        }
        return ref;
    },

    setDoc: async (docPath, data, options) => {
        const ref = FirebaseStore.docRef(docPath);
        if (!ref) return false;
        try {
            const merge = options && typeof options.merge === 'boolean' ? options.merge : true;
            await ref.set(data, { merge });
            return true;
        } catch (e) {
            return false;
        }
    },

    subscribeDoc: (docPath, onChange) => {
        const ref = FirebaseStore.docRef(docPath);
        if (!ref) return null;
        try {
            return ref.onSnapshot((doc) => {
                const data = doc.exists ? doc.data() : null;
                onChange(data);
            });
        } catch (e) {
            return null;
        }
    }
};

window.ShipmentManager = {
    _cache: [],
    _unsubAll: null,

    _normalizeId: (trackingId) => {
        return String(trackingId || '').trim().toUpperCase();
    },

    _normalizeShipment: (s) => {
        if (!s || typeof s !== 'object') return null;
        const copy = { ...s };
        copy.trackingId = ShipmentManager._normalizeId(copy.trackingId);
        if (typeof copy.paymentStatus !== 'string') copy.paymentStatus = copy.isPaid ? 'Paid' : 'Unpaid';
        if (!('paymentMethod' in copy)) copy.paymentMethod = null;
        if (typeof copy.isApproved !== 'boolean') copy.isApproved = true;
        if (typeof copy.isStopped !== 'boolean') copy.isStopped = false;
        if (!('stopReason' in copy)) copy.stopReason = null;
        if (!('description' in copy)) copy.description = 'Standard Package';
        if (!('weight' in copy)) copy.weight = '1kg';
        if (!Array.isArray(copy.history)) copy.history = [];
        if (!Array.isArray(copy.route)) copy.route = [];
        return copy;
    },

    enableRealtimeSync: () => {
        if (!FirebaseStore.enabled()) return false;
        if (ShipmentManager._unsubAll) return true;
        ShipmentManager._unsubAll = FirebaseStore.subscribeAll((rows) => {
            const normalized = rows.map(ShipmentManager._normalizeShipment).filter(Boolean);
            ShipmentManager._cache = normalized;
            try {
                localStorage.setItem('courier_shipments', JSON.stringify(normalized));
            } catch (e) {}
        });
        return true;
    },

    getAllShipments: () => {
        if (FirebaseStore.enabled()) {
            ShipmentManager.enableRealtimeSync();
            return Array.isArray(ShipmentManager._cache) ? ShipmentManager._cache : [];
        }
        const data = JSON.parse(localStorage.getItem('courier_shipments'));
        const shipments = Array.isArray(data) ? data : [];
        const normalized = shipments.map(ShipmentManager._normalizeShipment).filter(Boolean);
        localStorage.setItem('courier_shipments', JSON.stringify(normalized));
        return normalized;
    },

    getShipment: (trackingId) => {
        const id = ShipmentManager._normalizeId(trackingId);
        if (!id) return null;
        const shipments = ShipmentManager.getAllShipments();
        return shipments.find(s => ShipmentManager._normalizeId(s.trackingId) === id) || null;
    },

    saveShipment: (shipment) => {
        const shipments = ShipmentManager.getAllShipments();
        const index = shipments.findIndex(s => s.trackingId === shipment.trackingId);
        if (index >= 0) {
            shipments[index] = shipment;
        } else {
            shipments.push(shipment);
        }
        ShipmentManager._cache = shipments.map(ShipmentManager._normalizeShipment).filter(Boolean);
        localStorage.setItem('courier_shipments', JSON.stringify(ShipmentManager._cache));
        FirebaseStore.upsertShipment(ShipmentManager._normalizeShipment(shipment));
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
            trackingId: ShipmentManager._normalizeId(data.trackingId) || ShipmentManager.generateUniqueTrackingId(),
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
        ShipmentManager._cache = shipments;
        localStorage.setItem('courier_shipments', JSON.stringify(shipments));
        FirebaseStore.deleteShipment(ShipmentManager._normalizeId(trackingId));
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
    },

    subscribeShipment: (trackingId, onChange) => {
        const id = ShipmentManager._normalizeId(trackingId);
        if (!id || !FirebaseStore.enabled()) return null;
        return FirebaseStore.subscribeOne(id, (data) => {
            const normalized = ShipmentManager._normalizeShipment(data);
            if (normalized) {
                const all = ShipmentManager.getAllShipments();
                const idx = all.findIndex(s => ShipmentManager._normalizeId(s.trackingId) === id);
                if (idx >= 0) {
                    all[idx] = normalized;
                } else {
                    all.push(normalized);
                }
                ShipmentManager._cache = all;
                try {
                    localStorage.setItem('courier_shipments', JSON.stringify(all));
                } catch (e) {}
            }
            onChange(normalized);
        });
    }
};

window.PaymentSettings = {
    _cache: null,
    _unsub: null,
    _storageKey: 'courier_payment_settings',
    _docPath: 'config/payment',

    _defaults: () => ({
        methods: { crypto: true, bank: true, card: true },
        crypto: { btc: '', usdt: '', eth: '', note: 'Send exact amount. Reference: {TRACKING_ID}' },
        bank: { bankName: '', accountName: '', accountNo: '', routing: '', swift: '', iban: '', note: 'Use reference: {TRACKING_ID}' },
        card: { instructions: 'Card payments are available on request. Contact support to receive a secure invoice link.', link: '' }
    }),

    _normalize: (value) => {
        const base = window.PaymentSettings._defaults();
        const v = value && typeof value === 'object' ? value : {};
        const out = {
            methods: {
                crypto: !!(v.methods && v.methods.crypto),
                bank: !!(v.methods && v.methods.bank),
                card: !!(v.methods && v.methods.card)
            },
            crypto: {
                btc: String(v.crypto && v.crypto.btc ? v.crypto.btc : base.crypto.btc),
                usdt: String(v.crypto && v.crypto.usdt ? v.crypto.usdt : base.crypto.usdt),
                eth: String(v.crypto && v.crypto.eth ? v.crypto.eth : base.crypto.eth),
                note: String(v.crypto && v.crypto.note ? v.crypto.note : base.crypto.note)
            },
            bank: {
                bankName: String(v.bank && v.bank.bankName ? v.bank.bankName : base.bank.bankName),
                accountName: String(v.bank && v.bank.accountName ? v.bank.accountName : base.bank.accountName),
                accountNo: String(v.bank && v.bank.accountNo ? v.bank.accountNo : base.bank.accountNo),
                routing: String(v.bank && v.bank.routing ? v.bank.routing : base.bank.routing),
                swift: String(v.bank && v.bank.swift ? v.bank.swift : base.bank.swift),
                iban: String(v.bank && v.bank.iban ? v.bank.iban : base.bank.iban),
                note: String(v.bank && v.bank.note ? v.bank.note : base.bank.note)
            },
            card: {
                instructions: String(v.card && v.card.instructions ? v.card.instructions : base.card.instructions),
                link: String(v.card && v.card.link ? v.card.link : base.card.link)
            }
        };
        return out;
    },

    get: () => {
        if (window.PaymentSettings._cache) return window.PaymentSettings._cache;
        let raw = null;
        try {
            raw = JSON.parse(localStorage.getItem(window.PaymentSettings._storageKey) || 'null');
        } catch (e) {
            raw = null;
        }
        window.PaymentSettings._cache = window.PaymentSettings._normalize(raw);
        return window.PaymentSettings._cache;
    },

    save: async (settings) => {
        const normalized = window.PaymentSettings._normalize(settings);
        window.PaymentSettings._cache = normalized;
        try {
            localStorage.setItem(window.PaymentSettings._storageKey, JSON.stringify(normalized));
        } catch (e) {}
        if (FirebaseStore.enabled()) {
            await FirebaseStore.setDoc(window.PaymentSettings._docPath, normalized, { merge: true });
        }
        return true;
    },

    enableRealtimeSync: () => {
        if (!FirebaseStore.enabled()) return false;
        if (window.PaymentSettings._unsub) return true;
        window.PaymentSettings._unsub = FirebaseStore.subscribeDoc(window.PaymentSettings._docPath, (data) => {
            const normalized = window.PaymentSettings._normalize(data);
            window.PaymentSettings._cache = normalized;
            try {
                localStorage.setItem(window.PaymentSettings._storageKey, JSON.stringify(normalized));
            } catch (e) {}
        });
        return !!window.PaymentSettings._unsub;
    },

    subscribe: (onChange) => {
        window.PaymentSettings.enableRealtimeSync();
        onChange(window.PaymentSettings.get());
        if (!FirebaseStore.enabled()) return null;
        return FirebaseStore.subscribeDoc(window.PaymentSettings._docPath, (data) => {
            const normalized = window.PaymentSettings._normalize(data);
            window.PaymentSettings._cache = normalized;
            try {
                localStorage.setItem(window.PaymentSettings._storageKey, JSON.stringify(normalized));
            } catch (e) {}
            onChange(normalized);
        });
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
