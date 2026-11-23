import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { GeoJSONGeometry, OverlapNeighbor } from '../types/registrar';

interface LeafletParcelMapProps {
  geojson?: GeoJSONGeometry | null;
  boundaryCoordinates?: Array<[number, number]> | null;
  centroidLat?: number | null;
  centroidLng?: number | null;
  parcelLabel?: string;
  neighbors?: OverlapNeighbor[];
  heightClass?: string;
}

function toLatLngRing(
  geojson?: GeoJSONGeometry | null,
  boundaryCoordinates?: Array<[number, number]> | null
): Array<[number, number]> {
  if (geojson && Array.isArray(geojson.coordinates)) {
    if (geojson.type === 'Polygon') {
      const ring = (geojson.coordinates as number[][][])[0] || [];
      return ring.map(([lng, lat]) => [lat, lng]);
    }
    if (geojson.type === 'MultiPolygon') {
      const ring = (geojson.coordinates as number[][][][])[0]?.[0] || [];
      return ring.map(([lng, lat]) => [lat, lng]);
    }
  }
  if (Array.isArray(boundaryCoordinates) && boundaryCoordinates.length >= 3) {
    return boundaryCoordinates;
  }
  return [];
}

export function LeafletParcelMap({
  geojson,
  boundaryCoordinates,
  centroidLat,
  centroidLng,
  parcelLabel = 'Selected Parcel',
  neighbors = [],
  heightClass = 'h-[420px]',
}: LeafletParcelMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [centroidLat ?? 6.5244, centroidLng ?? 3.3792],
      zoom: 15,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 20,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    const bounds = L.latLngBounds([]);

    const primaryRing = toLatLngRing(geojson, boundaryCoordinates);
    if (primaryRing.length >= 3) {
      const poly = L.polygon(primaryRing, {
        color: '#1B7311',
        weight: 2.5,
        fillColor: '#49B114',
        fillOpacity: 0.22,
      })
        .bindPopup(`<div class="text-xs font-semibold text-slate-900">${parcelLabel}</div>`)
        .addTo(group);

      bounds.extend(poly.getBounds());
    }

    for (const neighbor of neighbors) {
      const neighborRing = toLatLngRing(neighbor.geojson || null, null);
      if (neighborRing.length >= 3) {
        const nPoly = L.polygon(neighborRing, {
          color: '#DC2626',
          weight: 2,
          dashArray: '5, 5',
          fillColor: '#EF4444',
          fillOpacity: 0.25,
        })
          .bindPopup(
            `<div class="text-xs"><div class="font-semibold text-rose-700">Overlap: ${neighbor.parcel_code || neighbor.parcel_id}</div><div class="text-slate-600">${neighbor.title || ''}</div></div>`
          )
          .addTo(group);
        bounds.extend(nPoly.getBounds());
      }
    }

    if (centroidLat != null && centroidLng != null) {
      const marker = L.circleMarker([centroidLat, centroidLng], {
        radius: 6,
        color: '#0D3F10',
        weight: 2,
        fillColor: '#1B7311',
        fillOpacity: 1,
      })
        .bindPopup(
          `<div class="text-xs font-mono">Centroid: ${centroidLat.toFixed(6)}, ${centroidLng.toFixed(6)}</div>`
        )
        .addTo(group);
      bounds.extend(marker.getLatLng());
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 18 });
    } else if (centroidLat != null && centroidLng != null) {
      map.setView([centroidLat, centroidLng], 15);
    }

    setTimeout(() => {
      map.invalidateSize();
    }, 60);
  }, [geojson, boundaryCoordinates, centroidLat, centroidLng, parcelLabel, neighbors]);

  return (
    <div className={`w-full ${heightClass} rounded-xl overflow-hidden border border-slate-200 bg-[#FAFDF8] relative z-0`}>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
