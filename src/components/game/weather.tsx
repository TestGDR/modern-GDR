"use client";

import { useEffect, useState } from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Moon,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Waves,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Meteo reale di Miami da Open-Meteo (gratuito, senza chiavi), letto dal browser.
// Si tiene in memoria per 30 minuti: tutti i componenti usano la stessa lettura.

const FORECAST =
  "https://api.open-meteo.com/v1/forecast?latitude=25.7743&longitude=-80.1937" +
  "&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m,wind_direction_10m" +
  "&hourly=temperature_2m,weather_code,precipitation_probability,is_day" +
  "&daily=sunrise,sunset,uv_index_max,temperature_2m_max,temperature_2m_min" +
  "&timezone=America%2FNew_York&forecast_days=2";
const MARINE = "https://marine-api.open-meteo.com/v1/marine?latitude=25.78&longitude=-80.12&current=wave_height,sea_surface_temperature&timezone=America%2FNew_York";
const TTL = 30 * 60 * 1000;
const STORE = "gdr_meteo_miami";

export type Weather = {
  at: number;
  time: string;
  temp: number;
  feels: number;
  humidity: number;
  isDay: boolean;
  code: number;
  wind: number;
  windDir: number;
  max: number;
  min: number;
  uv: number;
  sunrise: string;
  sunset: string;
  sea: number | null;
  waves: number | null;
  hours: { time: string; temp: number; code: number; rain: number; isDay: boolean }[];
};

type Forecast = {
  current: { time: string; temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number; is_day: number; weather_code: number; wind_speed_10m: number; wind_direction_10m: number };
  hourly: { time: string[]; temperature_2m: number[]; weather_code: number[]; precipitation_probability: number[]; is_day: number[] };
  daily: { sunrise: string[]; sunset: string[]; uv_index_max: number[]; temperature_2m_max: number[]; temperature_2m_min: number[] };
};

let pending: Promise<Weather | null> | null = null;

function readStore(): Weather | null {
  try {
    const raw = localStorage.getItem(STORE);
    const w = raw ? (JSON.parse(raw) as Weather) : null;
    return w && Date.now() - w.at < TTL ? w : null;
  } catch {
    return null;
  }
}

async function fetchWeather(): Promise<Weather | null> {
  try {
    const [f, m] = await Promise.all([
      fetch(FORECAST).then((r) => (r.ok ? (r.json() as Promise<Forecast>) : null)),
      fetch(MARINE)
        .then((r) => (r.ok ? (r.json() as Promise<{ current?: { wave_height?: number; sea_surface_temperature?: number } }>) : null))
        .catch(() => null),
    ]);
    if (!f) return null;
    const c = f.current;
    const start = Math.max(0, f.hourly.time.findIndex((t) => t >= c.time.slice(0, 13)));
    const w: Weather = {
      at: Date.now(),
      time: c.time,
      temp: c.temperature_2m,
      feels: c.apparent_temperature,
      humidity: c.relative_humidity_2m,
      isDay: c.is_day === 1,
      code: c.weather_code,
      wind: c.wind_speed_10m,
      windDir: c.wind_direction_10m,
      max: f.daily.temperature_2m_max[0],
      min: f.daily.temperature_2m_min[0],
      uv: f.daily.uv_index_max[0],
      sunrise: f.daily.sunrise[0],
      sunset: f.daily.sunset[0],
      sea: m?.current?.sea_surface_temperature ?? null,
      waves: m?.current?.wave_height ?? null,
      hours: f.hourly.time.slice(start + 1, start + 7).map((t, i) => ({
        time: t,
        temp: f.hourly.temperature_2m[start + 1 + i],
        code: f.hourly.weather_code[start + 1 + i],
        rain: f.hourly.precipitation_probability[start + 1 + i] ?? 0,
        isDay: f.hourly.is_day[start + 1 + i] === 1,
      })),
    };
    try {
      localStorage.setItem(STORE, JSON.stringify(w));
    } catch {
      // archivio del browser non disponibile: si rilegge la prossima volta
    }
    return w;
  } catch {
    return null;
  }
}

/** Meteo di Miami (null finché non arriva o se il servizio non risponde) */
export function useMiamiWeather() {
  const [weather, setWeather] = useState<Weather | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      const cached = readStore();
      if (cached) return setWeather(cached);
      pending ??= fetchWeather().finally(() => {
        pending = null;
      });
      pending.then((w) => alive && w && setWeather(w));
    };
    const t = setTimeout(load, 0);
    const every = setInterval(load, 5 * 60 * 1000);
    return () => {
      alive = false;
      clearTimeout(t);
      clearInterval(every);
    };
  }, []);
  return weather;
}

/* ------------------------------ Codici meteo (WMO) ------------------------------ */

function describe(code: number, isDay: boolean): { label: string; icon: LucideIcon } {
  if (code === 0) return { label: isDay ? "Sereno" : "Cielo stellato", icon: isDay ? Sun : Moon };
  if (code === 1) return { label: "Quasi sereno", icon: isDay ? CloudSun : CloudMoon };
  if (code === 2) return { label: "Poco nuvoloso", icon: isDay ? CloudSun : CloudMoon };
  if (code === 3) return { label: "Nuvoloso", icon: Cloud };
  if (code === 45 || code === 48) return { label: "Nebbia", icon: CloudFog };
  if (code >= 51 && code <= 57) return { label: "Pioviggine", icon: CloudDrizzle };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: code >= 80 ? "Rovesci" : "Pioggia", icon: CloudRain };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: "Neve", icon: CloudSnow };
  if (code >= 95) return { label: "Temporale", icon: CloudLightning };
  return { label: "Variabile", icon: CloudSun };
}

const DIRS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
const windDir = (deg: number) => DIRS[Math.round(deg / 45) % 8];
/** "2026-10-29T18:52" → "18:52" (già nell'ora di Miami) */
const hhmm = (iso: string) => iso.slice(11, 16);

/** Icona e temperatura, per il pulsante della barra laterale */
export function WeatherBadge({ weather, className }: { weather: Weather | null; className?: string }) {
  if (!weather) return null;
  const d = describe(weather.code, weather.isDay);
  return (
    <span className={cn("flex items-center gap-1", className)} title={`Miami: ${d.label}, ${Math.round(weather.temp)}°C`}>
      <d.icon className="size-4" />
      <span className="text-xs font-semibold tabular-nums">{Math.round(weather.temp)}°</span>
    </span>
  );
}

/** Dettaglio del meteo di Miami */
export function WeatherDetails({ weather }: { weather: Weather | null }) {
  if (!weather) return <p className="text-sm text-muted-foreground">Il meteo di Miami sta arrivando…</p>;
  const d = describe(weather.code, weather.isDay);
  const rows: { icon: LucideIcon; label: string; value: string }[] = [
    { icon: Thermometer, label: "Percepita", value: `${Math.round(weather.feels)}°C` },
    { icon: Droplets, label: "Umidità", value: `${weather.humidity}%` },
    { icon: Wind, label: "Vento", value: `${Math.round(weather.wind)} km/h da ${windDir(weather.windDir)}` },
    { icon: Sun, label: "Indice UV", value: `${Math.round(weather.uv)}` },
    ...(weather.sea !== null ? [{ icon: Waves, label: "Mare", value: `${Math.round(weather.sea)}°C${weather.waves !== null ? ` · onde ${weather.waves.toFixed(1)} m` : ""}` }] : []),
    { icon: Sunrise, label: "Alba", value: hhmm(weather.sunrise) },
    { icon: Sunset, label: "Tramonto", value: hhmm(weather.sunset) },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <d.icon className="size-14 text-peach" />
        <div>
          <p className="font-heading text-5xl leading-none tracking-wide">{Math.round(weather.temp)}°C</p>
          <p className="text-sm">{d.label}</p>
          <p className="text-xs text-muted-foreground">
            Max {Math.round(weather.max)}° · min {Math.round(weather.min)}° · ore {hhmm(weather.time)} a Miami
          </p>
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-2 text-sm">
        {rows.map((r) => (
          <li key={r.label} className={cn("flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2", r.label === "Mare" && "col-span-2")}>
            <r.icon className="size-4 shrink-0 text-lavender" />
            <span className="text-muted-foreground">{r.label}</span>
            <span className="ml-auto font-medium">{r.value}</span>
          </li>
        ))}
      </ul>
      {weather.hours.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs tracking-widest text-muted-foreground uppercase">Prossime ore</p>
          <ul className="grid grid-cols-6 gap-1 text-center text-xs">
            {weather.hours.map((h) => {
              const hd = describe(h.code, h.isDay);
              return (
                <li key={h.time} className="flex flex-col items-center gap-1 rounded-xl bg-white/5 py-2">
                  <span className="text-muted-foreground">{hhmm(h.time)}</span>
                  <hd.icon className="size-4" />
                  <span className="font-medium">{Math.round(h.temp)}°</span>
                  {h.rain >= 20 && <span className="text-[0.65rem] text-mint">{h.rain}%</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <p className="text-[0.7rem] text-muted-foreground">Meteo reale di Miami (Florida) da Open-Meteo, aggiornato ogni 30 minuti. Gli orari sono quelli di Miami.</p>
    </div>
  );
}
