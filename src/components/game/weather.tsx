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

// Meteo reale di Miami da Open-Meteo (gratuito, senza chiavi), letto dal browser,
// ALLINEATO ALL'ORA ITALIANA: si gioca con l'orologio italiano, quindi alle 21 in
// Italia si mostra il meteo che Miami ha (o avrà) alle sue 21. Si usano le
// previsioni orarie di Miami. Si tiene in memoria per 30 minuti.

const FORECAST =
  "https://api.open-meteo.com/v1/forecast?latitude=25.7743&longitude=-80.1937" +
  "&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,precipitation_probability,is_day,wind_speed_10m,wind_direction_10m" +
  "&daily=sunrise,sunset,uv_index_max,temperature_2m_max,temperature_2m_min" +
  "&timezone=America%2FNew_York&forecast_days=3";
const MARINE = "https://marine-api.open-meteo.com/v1/marine?latitude=25.78&longitude=-80.12&hourly=wave_height,sea_surface_temperature&timezone=America%2FNew_York&forecast_days=3";
const TTL = 30 * 60 * 1000;
const STORE = "gdr_meteo_miami_ora_italiana";

export type Weather = {
  at: number;
  /** Ora di gioco (ora italiana), "2026-10-29T21:00" */
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
  hourly: {
    time: string[];
    temperature_2m: number[];
    apparent_temperature: number[];
    relative_humidity_2m: number[];
    weather_code: number[];
    precipitation_probability: number[];
    is_day: number[];
    wind_speed_10m: number[];
    wind_direction_10m: number[];
  };
  daily: { time?: string[]; sunrise: string[]; sunset: string[]; uv_index_max: number[]; temperature_2m_max: number[]; temperature_2m_min: number[] };
};
type Marine = { hourly?: { time: string[]; wave_height: (number | null)[]; sea_surface_temperature: (number | null)[] } };

let pending: Promise<Weather | null> | null = null;

/** Ora italiana adesso, come "2026-10-29T21" (si cerca la stessa ora nelle previsioni di Miami) */
function italianHour() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}`;
}

function readStore(): Weather | null {
  try {
    const raw = localStorage.getItem(STORE);
    const w = raw ? (JSON.parse(raw) as Weather) : null;
    // valido 30 minuti e solo se è ancora la stessa ora italiana
    return w && Date.now() - w.at < TTL && w.time.slice(0, 13) === italianHour() ? w : null;
  } catch {
    return null;
  }
}

async function fetchWeather(): Promise<Weather | null> {
  try {
    const [f, m] = await Promise.all([
      fetch(FORECAST).then((r) => (r.ok ? (r.json() as Promise<Forecast>) : null)),
      fetch(MARINE)
        .then((r) => (r.ok ? (r.json() as Promise<Marine>) : null))
        .catch(() => null),
    ]);
    if (!f) return null;
    const h = f.hourly;
    const target = italianHour();
    // l'ora di Miami con lo stesso orologio dell'Italia (di solito 5-6 ore più avanti)
    let i = h.time.findIndex((t) => t.startsWith(target));
    if (i < 0) i = Math.max(0, h.time.findIndex((t) => t >= target));
    const day = target.slice(0, 10);
    const d = Math.max(0, (f.daily.time ?? []).indexOf(day));
    const mi = m?.hourly ? m.hourly.time.findIndex((t) => t.startsWith(h.time[i].slice(0, 13))) : -1;
    const w: Weather = {
      at: Date.now(),
      time: h.time[i],
      temp: h.temperature_2m[i],
      feels: h.apparent_temperature[i],
      humidity: h.relative_humidity_2m[i],
      isDay: h.is_day[i] === 1,
      code: h.weather_code[i],
      wind: h.wind_speed_10m[i],
      windDir: h.wind_direction_10m[i],
      max: f.daily.temperature_2m_max[d],
      min: f.daily.temperature_2m_min[d],
      uv: f.daily.uv_index_max[d],
      sunrise: f.daily.sunrise[d],
      sunset: f.daily.sunset[d],
      sea: mi >= 0 ? (m?.hourly?.sea_surface_temperature[mi] ?? null) : null,
      waves: mi >= 0 ? (m?.hourly?.wave_height[mi] ?? null) : null,
      hours: h.time.slice(i + 1, i + 7).map((t, k) => ({
        time: t,
        temp: h.temperature_2m[i + 1 + k],
        code: h.weather_code[i + 1 + k],
        rain: h.precipitation_probability[i + 1 + k] ?? 0,
        isDay: h.is_day[i + 1 + k] === 1,
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
            Max {Math.round(weather.max)}° · min {Math.round(weather.min)}° · ore {hhmm(weather.time)}
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
      <p className="text-[0.7rem] text-muted-foreground">Meteo reale di Miami (Florida) da Open-Meteo, allineato all&apos;ora italiana: si mostra il tempo che fa a Miami alla stessa ora che segna l&apos;orologio in Italia. Si aggiorna ogni 30 minuti.</p>
    </div>
  );
}
