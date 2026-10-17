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
export interface WmtsLayer extends LayerBase {
  kind: 'wmts'
  projection: 'EPSG:5514'
  url: string
  grid: WmtsGrid
  period?: string
  // The service fills the area outside its region with pure white: such pixels are made transparent, so a layer
  // in a group does not cover its neighbour (the paper of the maps is cream, never pure white)
  whiteIsEmpty?: boolean
}
// Several regional layers shown together as one choice; each is drawn only where it has data
export interface WmtsGroupLayer extends LayerBase { kind: 'group'; period: string; parts: WmtsLayer[] }
export type HistoricLayer = WmtsLayer | WmtsGroupLayer
export interface WmsLayer extends LayerBase { kind: 'wms'; url: string; layers: string; transparent: boolean }
export type MapLayer = XyzLayer | WmtsLayer | WmsLayer

const CUZK_ATTRIBUTION = '© <a href="https://cuzk.gov.cz" target="_blank" rel="noopener">ČÚZK</a> (CC BY 4.0)'

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
    // Topographic map with contour lines and relief from OpenStreetMap data (CC BY-SA, fair use)
    id: 'otm',
    kind: 'xyz',
    label: 'map.layer.otm',
    url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>, styl © <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (CC BY-SA)',
    maxZoom: 17,
  },
  {
    id: 'ztm',
    kind: 'xyz',
    label: 'map.layer.ztm',
    url: 'https://ags.cuzk.gov.cz/arcgis1/rest/services/ZTM_WM/MapServer/tile/{z}/{y}/{x}',
    attribution: CUZK_ATTRIBUTION,
    maxZoom: 19,
  },
  {
    id: 'orto',
    kind: 'xyz',
    label: 'map.layer.orto',
    url: 'https://ags.cuzk.gov.cz/arcgis1/rest/services/ORTOFOTO_WM/MapServer/tile/{z}/{y}/{x}',
    attribution: CUZK_ATTRIBUTION,
    maxZoom: 20,
  },
]

// The CENIA military surveys and the historical orthophoto share this grid (from their WMTS capabilities, 17. 10. 2026)
const CENIA_GRID: WmtsGrid = {
  origin: [-925000, -920000],
  scaleDenominators: [3657600, 1828800, 914400, 457200, 228600, 114300, 57150, 28575, 14287.5, 7143.75, 3571.875, 1785.9375, 892.96875],
  tileSize: 512,
  extent: [-925000, -1444353.536, -400646.464, -920000],
}

// Imperial imprints of the stable cadastre published by the regions (an open nationwide service does not exist:
// the ČÚZK one needs a token). Outside its region the South Bohemian and Moravian-Silesian services return no
// tile (HTTP 400), the South Moravian one returns pure white tiles (hence whiteIsEmpty, checked 17. 10. 2026).
const IMPERIAL_IMPRINT_PARTS: WmtsLayer[] = [
  {
    // South Bohemian Region; missing imprints are replaced by original maps of the stable cadastre
    id: 'cio-jc',
    kind: 'wmts',
    label: 'map.layer.cio',
    period: '1824–1843',
    projection: 'EPSG:5514',
    url: 'https://gis.kraj-jihocesky.cz/arcgis/rest/services/podkladove/cisarske_otisky/MapServer/WMTS/tile/1.0.0/podkladove_cisarske_otisky/default/default028mm/{TileMatrix}/{TileRow}/{TileCol}.jpg',
    grid: {
      origin: [-925000, -920000],
      scaleDenominators: [7315214.630428341, 3657607.3152141706, 1828803.6576070853, 914401.8288035427, 457200.9144017713, 228600.45720088566, 114300.22860044283, 57150.114300221416, 28575.057150110708, 14287.528575055354, 7143.764287527677, 3571.8821437638385, 1785.9410718819192, 892.9705359409596, 446.4852679704798],
      tileSize: 256,
      extent: [-844681.1757842265, -1217399.390001905, -651258.4891732283, -1091381.5127317754],
    },
    attribution: 'Císařské otisky © ČÚZK, služba © <a href="https://geoportal.kraj-jihocesky.gov.cz" target="_blank" rel="noopener">Jihočeský kraj</a>',
    whiteIsEmpty: true,
  },
  {
    // South Moravian Region (Brno, Znojmo…), 1824–1836
    id: 'cio-jmk',
    kind: 'wmts',
    label: 'map.layer.cio',
    period: '1824–1836',
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
    whiteIsEmpty: true,
  },
  {
    // Moravian-Silesian Region (Ostrava, Český Těšín…); scans of ÚAZK, 1830–1836
    id: 'cio-msk',
    kind: 'wmts',
    label: 'map.layer.cio',
    period: '1830–1836',
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
    whiteIsEmpty: true,
  },
]

// Historical maps; at most one is shown over the base, with adjustable opacity
export const HISTORIC_LAYERS: HistoricLayer[] = [
  {
    // One choice for all regions with imprints: each part is drawn only where its region has data
    id: 'cio',
    kind: 'group',
    label: 'map.layer.cio',
    period: '1824–1843',
    minZoom: 10,
    attribution: '',
    parts: IMPERIAL_IMPRINT_PARTS,
  },
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
    // Aerial photos of the first nationwide survey flight, before collectivisation (CC BY 4.0)
    id: 'orto50',
    kind: 'wmts',
    label: 'map.layer.orto50',
    period: '1949–1956',
    projection: 'EPSG:5514',
    url: 'https://gis.cenia.cz/mapcache/ortofotomapa_historicka/wmts/1.0.0/orto/default/jtsk:epsg:5514/{TileMatrix}/{TileRow}/{TileCol}.jpgpng',
    grid: CENIA_GRID,
    attribution: 'Historická ortofotomapa © <a href="https://www.cenia.cz" target="_blank" rel="noopener">CENIA</a> (CC BY 4.0)',
  },
]

// Former separate choices of the regional imprints, kept in older settings
export const LEGACY_HISTORIC_LAYER_IDS: Record<string, string> = { 'cio-jc': 'cio', 'cio-jmk': 'cio', 'cio-msk': 'cio' }

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

// Further transparent overlays that can be switched on together (checkboxes under the historical map)
export const OVERLAY_LAYERS: WmsLayer[] = [
  {
    // Today's parcels with their numbers (cadastral map of ČÚZK, open data)
    id: 'kn',
    kind: 'wms',
    label: 'map.layer.kn',
    url: 'https://services.cuzk.gov.cz/wms/wms.asp',
    layers: 'KN',
    transparent: true,
    minZoom: 14,
    attribution: 'Katastrální mapa ' + CUZK_ATTRIBUTION,
  },
  {
    // Buildings with house numbers (čísla popisná) and address points from RÚIAN
    id: 'ruian',
    kind: 'wms',
    label: 'map.layer.ruian',
    url: 'https://ags.cuzk.gov.cz/arcgis/services/RUIAN/MapServer/WMSServer',
    layers: 'StavebniObjekt,AdresniMisto',
    transparent: true,
    minZoom: 15,
    attribution: 'RÚIAN ' + CUZK_ATTRIBUTION,
  },
]

export const BASE_LAYER_IDS = BASE_LAYERS.map(layer => layer.id)
export const HISTORIC_LAYER_IDS = ['none', 'overlays', ...HISTORIC_LAYERS.map(layer => layer.id)]
export const OVERLAY_LAYER_IDS = OVERLAY_LAYERS.map(layer => layer.id)
