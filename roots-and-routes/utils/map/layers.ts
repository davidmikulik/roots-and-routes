// Catalog of the map layers (page /map, component EventMap.client.vue). Plain data, no OpenLayers code, so that
// the settings can validate layer ids. Services, coordinate systems and terms: docs/mapove-vrstvy-navrh.md.
//
// The map view is Web Mercator (EPSG:3857). Layers published only in S-JTSK (EPSG:5514) are reprojected in the
// browser by OpenLayers (proj4 + register, see EventMap.client.vue).

export interface WmtsGrid {
  // Top left corner of the tile matrix set in the layer's coordinates
  origin: [number, number]
  // WMTS ScaleDenominator of each level (resolution = denominator × 0.00028 m)
  scaleDenominators: number[]
  tileSize: number
  // Extent of the data in the layer's coordinates (tiles outside are not requested)
  extent: [number, number, number, number]
}

interface LayerBase {
  id: string
  // i18n keys
  label: string
  attribution: string
  maxZoom?: number
  // Below this zoom of the map the layer is not drawn (regional layers would only request empty tiles)
  minZoom?: number
}
export interface XyzLayer extends LayerBase { kind: 'xyz'; url: string }
export interface WmtsLayer extends LayerBase { kind: 'wmts'; projection: 'EPSG:5514'; url: string; grid: WmtsGrid; period?: string }
export interface WmsLayer extends LayerBase { kind: 'wms'; url: string; layers: string; transparent: boolean }
export type MapLayer = XyzLayer | WmtsLayer | WmsLayer

// Current maps; one of them is always the base
export const BASE_LAYERS: XyzLayer[] = [
  {
    id: 'osm',
    kind: 'xyz',
    label: 'map.layer.osm',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    maxZoom: 19,
  },
  {
    id: 'ztm',
    kind: 'xyz',
    label: 'map.layer.ztm',
    url: 'https://ags.cuzk.gov.cz/arcgis1/rest/services/ZTM_WM/MapServer/tile/{z}/{y}/{x}',
    attribution: '© <a href="https://cuzk.gov.cz" target="_blank" rel="noopener">ČÚZK</a> (CC BY 4.0)',
    maxZoom: 19,
  },
  {
    id: 'orto',
    kind: 'xyz',
    label: 'map.layer.orto',
    url: 'https://ags.cuzk.gov.cz/arcgis1/rest/services/ORTOFOTO_WM/MapServer/tile/{z}/{y}/{x}',
    attribution: '© <a href="https://cuzk.gov.cz" target="_blank" rel="noopener">ČÚZK</a> (CC BY 4.0)',
    maxZoom: 20,
  },
]

// Both CENIA military surveys share this grid (from their WMTS capabilities, 17. 10. 2026)
const CENIA_GRID: WmtsGrid = {
  origin: [-925000, -920000],
  scaleDenominators: [3657600, 1828800, 914400, 457200, 228600, 114300, 57150, 28575, 14287.5, 7143.75, 3571.875, 1785.9375, 892.96875],
  tileSize: 512,
  extent: [-925000, -1444353.536, -400646.464, -920000],
}

// Historical maps; at most one is shown over the base, with adjustable opacity
export const HISTORIC_LAYERS: WmtsLayer[] = [
  {
    id: 'vm2',
    kind: 'wmts',
    label: 'map.layer.vm2',
    period: '1836–1852',
    projection: 'EPSG:5514',
    url: 'https://gis.cenia.cz/mapcache/II_vojenske_mapovani/wmts/1.0.0/II_vojenske_mapovani/default/jtsk:epsg:5514/{TileMatrix}/{TileRow}/{TileCol}.jpgpng',
    grid: CENIA_GRID,
    attribution: '2. vojenské mapování © <a href="https://www.cenia.cz" target="_blank" rel="noopener">CENIA</a>',
  },
  {
    id: 'vm3',
    kind: 'wmts',
    label: 'map.layer.vm3',
    period: '1876–1880',
    projection: 'EPSG:5514',
    url: 'https://gis.cenia.cz/mapcache/III_vojenske_mapovani/wmts/1.0.0/III_vojenske_mapovani/default/jtsk:epsg:5514/{TileMatrix}/{TileRow}/{TileCol}.jpgpng',
    grid: CENIA_GRID,
    attribution: '3. vojenské mapování © <a href="https://www.cenia.cz" target="_blank" rel="noopener">CENIA</a>',
  },
  {
    // South Bohemian Region only; missing imprints are replaced by original maps of the stable cadastre
    id: 'cio-jc',
    kind: 'wmts',
    label: 'map.layer.cioJc',
    period: '1824–1843',
    minZoom: 10,
    projection: 'EPSG:5514',
    url: 'https://gis.kraj-jihocesky.cz/arcgis/rest/services/podkladove/cisarske_otisky/MapServer/WMTS/tile/1.0.0/podkladove_cisarske_otisky/default/default028mm/{TileMatrix}/{TileRow}/{TileCol}.jpg',
    grid: {
      origin: [-925000, -920000],
      scaleDenominators: [7315214.630428341, 3657607.3152141706, 1828803.6576070853, 914401.8288035427, 457200.9144017713, 228600.45720088566, 114300.22860044283, 57150.114300221416, 28575.057150110708, 14287.528575055354, 7143.764287527677, 3571.8821437638385, 1785.9410718819192, 892.9705359409596, 446.4852679704798],
      tileSize: 256,
      extent: [-844681.1757842265, -1217399.390001905, -651258.4891732283, -1091381.5127317754],
    },
    attribution: 'Císařské otisky © ČÚZK, služba © <a href="https://geoportal.kraj-jihocesky.gov.cz" target="_blank" rel="noopener">Jihočeský kraj</a>',
  },
  {
    // South Moravian Region only (Brno, Znojmo…)
    id: 'cio-jmk',
    kind: 'wmts',
    label: 'map.layer.cioJmk',
    period: '1824–1836',
    minZoom: 10,
    projection: 'EPSG:5514',
    url: 'https://mapy1.jmk.cz/erdas-iws/ogc/wmts/JMK_CO/Cisarske_otisky/default/JTSK:epsg:5514/{TileMatrix}/{TileRow}/{TileCol}.jpg',
    grid: {
      origin: [-925000, -920000],
      scaleDenominators: [7315200, 3657600, 1828800, 914400, 457200, 228600, 114300, 57150, 28575, 14287.5, 7143.75, 3571.875, 1785.9375, 892.96875, 446.484375],
      tileSize: 256,
      // from the WGS84 bounding box of the capabilities
      extent: [-694485, -1238304, -515817, -1095170],
    },
    attribution: 'Císařské otisky © ČÚZK, služba © <a href="https://mapy.jmk.cz/geoportal" target="_blank" rel="noopener">Jihomoravský kraj</a>',
  },
  {
    // Moravian-Silesian Region only (Ostrava, Český Těšín…); scans of ÚAZK, 1830–1836
    id: 'cio-msk',
    kind: 'wmts',
    label: 'map.layer.cioMsk',
    period: '1830–1836',
    minZoom: 10,
    projection: 'EPSG:5514',
    url: 'https://gis2.msk.cz/arcgis/rest/services/podklad/podklad_cis_otisky/MapServer/WMTS/tile/1.0.0/podklad_podklad_cis_otisky/default/default028mm/{TileMatrix}/{TileRow}/{TileCol}',
    grid: {
      // ArcGIS default tiling origin
      origin: [-33699800, 33699800],
      scaleDenominators: [3657607.3152141706, 1828803.6576070853, 914401.8288035427, 457200.9144017713, 228600.45720088566, 114300.22860044283, 57150.114300221416, 28575.057150110708, 14287.528575055354, 7143.764287527677, 3571.8821437638385, 1785.9410718819192, 892.9705359409596, 446.95773915351737],
      tileSize: 256,
      extent: [-552132.4334999993, -1151590.2657999992, -431585.2133000009, -1042986.9957999997],
    },
    attribution: 'Císařské otisky © ČÚZK, služba © <a href="https://geoportal.msk.cz" target="_blank" rel="noopener">Moravskoslezský kraj</a>',
  },
]

// Transparent overlay with historical (e.g. German) place names
export const NAMES_LAYER: WmsLayer = {
  id: 'names',
  kind: 'wms',
  label: 'map.layer.names',
  url: 'https://ags.cuzk.gov.cz/arcgis/services/GEONAMES/HistorickaJmena/MapServer/WMSServer',
  layers: '0',
  transparent: true,
  attribution: 'Historická jména © <a href="https://cuzk.gov.cz" target="_blank" rel="noopener">ČÚZK</a>',
}

export const BASE_LAYER_IDS = BASE_LAYERS.map(layer => layer.id)
export const HISTORIC_LAYER_IDS = ['none', 'overlays', ...HISTORIC_LAYERS.map(layer => layer.id)]
