/**
 * Geo-personalized suggestion chips - shown to users on first visit.
 * One chip per data catalog (9 datasets). Edit this file to add/change suggestion topics.
 */

import type { GeoIP } from "@/lib/use-geo-ip";

/** Build initial suggestions personalized to user's geo-IP location. Falls back to global suggestions. */
export function buildInitialSuggestions(geo: GeoIP | null) {
  const city = geo?.city;
  const country = geo?.country;
  if (city && country) {
    const place = `${city}, ${country}`;
    return [
      // Primary (shown first) - one per core catalog
      {
        id: "s-weather",
        title: `Weather in ${city}`,
        detailedSuggestion: `Show me the 5-day weather forecast for ${place} - temperature, precipitation, and wind.`,
        messageId: "s-weather",
      },
      {
        id: "s-buildings",
        title: `Buildings in ${city}`,
        detailedSuggestion: `Show building density and heights in ${place} - tallest structures and built volume.`,
        messageId: "s-buildings",
      },
      {
        id: "s-population",
        title: `Population in ${city}`,
        detailedSuggestion: `How is population projected to change around ${place} from 2025 to 2100?`,
        messageId: "s-population",
      },
      {
        id: "s-places",
        title: `Places in ${city}`,
        detailedSuggestion: `What places of interest are around ${place}? Show restaurants, shops, hospitals, schools, and parks.`,
        messageId: "s-places",
      },
      {
        id: "s-transport",
        title: `Transport in ${city}`,
        detailedSuggestion: `Map the road and transport network around ${place} - road types, rail, and cycling infrastructure.`,
        messageId: "s-transport",
      },
      // Extended pool - loaded on scroll - remaining catalogs
      {
        id: "s-terrain",
        title: `Terrain around ${city}`,
        detailedSuggestion: `Show terrain elevation, slope, and aspect around ${place}.`,
        messageId: "s-terrain",
      },
      {
        id: "s-base",
        title: `Land use in ${city}`,
        detailedSuggestion: `Break down land use and water coverage around ${place} - parks, forest, urban, and water types.`,
        messageId: "s-base",
      },
      {
        id: "s-building-types",
        title: `Building types in ${city}`,
        detailedSuggestion: `What types of buildings are in ${place}? Show residential, commercial, civic, education, and religious breakdown.`,
        messageId: "s-building-types",
      },
      {
        id: "s-addresses",
        title: `Addresses in ${city}`,
        detailedSuggestion: `Where are addresses most concentrated around ${place}? Show address counts and unique postcodes.`,
        messageId: "s-addresses",
      },
      {
        id: "s-global-heat",
        title: "Where is it hottest now",
        detailedSuggestion: "Which countries and major cities have temperatures above 40C right now?",
        messageId: "s-global-heat",
      },
    ];
  }
  // Fallback when geo-IP is blocked or unavailable - one chip per catalog
  return [
    // Primary (shown first) - one per core catalog
    {
      id: "s-weather",
      title: "Weather forecast",
      detailedSuggestion: "Show me the 5-day weather forecast for Cairo - temperature, precipitation, and wind.",
      messageId: "s-weather",
    },
    {
      id: "s-buildings",
      title: "Building density",
      detailedSuggestion: "Show building density and heights in Tokyo - tallest structures and built volume.",
      messageId: "s-buildings",
    },
    {
      id: "s-population",
      title: "Population growth",
      detailedSuggestion: "Where is population projected to grow fastest by 2100?",
      messageId: "s-population",
    },
    {
      id: "s-places",
      title: "Places of interest",
      detailedSuggestion:
        "What places of interest are around London? Show restaurants, shops, hospitals, schools, and parks.",
      messageId: "s-places",
    },
    {
      id: "s-transport",
      title: "Transport network",
      detailedSuggestion: "Map the road and transport network around Berlin - road types, rail, and cycling infra.",
      messageId: "s-transport",
    },
    // Extended pool - loaded on scroll - remaining catalogs
    {
      id: "s-terrain",
      title: "Terrain analysis",
      detailedSuggestion: "Show me the highest elevations in the Himalayas with slope and aspect.",
      messageId: "s-terrain",
    },
    {
      id: "s-base",
      title: "Land use & water",
      detailedSuggestion: "Break down land use and water coverage around Amsterdam - parks, forest, urban, and water.",
      messageId: "s-base",
    },
    {
      id: "s-building-types",
      title: "Building types",
      detailedSuggestion:
        "What types of buildings are in Cairo? Show residential, commercial, civic, and religious breakdown.",
      messageId: "s-building-types",
    },
    {
      id: "s-addresses",
      title: "Address density",
      detailedSuggestion: "Where are addresses most concentrated in Paris? Show address counts and unique postcodes.",
      messageId: "s-addresses",
    },
    {
      id: "s-global-heat",
      title: "Where is it hottest now",
      detailedSuggestion: "Which countries and major cities have temperatures above 40C right now?",
      messageId: "s-global-heat",
    },
  ];
}
