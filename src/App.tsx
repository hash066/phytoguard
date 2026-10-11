import { useCallback, useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CheckCircle2, CloudSun, Database, Download, FlaskConical, MapPin, RefreshCw, SlidersHorizontal, Wind } from 'lucide-react';
import benchmark from '../benchmarks/report.json';
import { scenario, scenarioSummary, transportBearing } from './model';
import './styles.css';
import './enhancements.css';

type Weather = { time: string; windSpeed: number; windDirection: number; source: string; live: boolean };

const fallback: Weather = {
  time: '2023-09-25T18:00',
  windSpeed: 11.2,
  windDirection: 195,
  source: 'Cached ERA5 reanalysis example',
  live: false,
};

export default function App() {
  const [hour, setHour] = useState(0.45);
  const [windSpeed, setWindSpeed] = useState(fallback.windSpeed);
  const [windDirection, setWindDirection] = useState(fallback.windDirection);
  const [sourceRate, setSourceRate] = useState(100);
  const [reduction, setReduction] = useState(0);
  const [selected, setSelected] = useState('F-21');
  const [weather, setWeather] = useState(fallback);
  const [loading, setLoading] = useState(false);
  const [weatherError, setWeatherError] = useState('');

  const loadWeather = useCallback(async () => {
    setLoading(true);
    setWeatherError('');
    try {
      const url = 'https://archive-api.open-meteo.com/v1/archive?latitude=12.9716&longitude=77.5946&start_date=2023-09-25&end_date=2023-09-25&hourly=wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh&timezone=Asia%2FKolkata';
      const response = await fetch(url);
      if (!response.ok) throw new Error(`weather service returned ${response.status}`);
      const data = await response.json();
      const index = data.hourly.time.findIndex((time: string) => time.endsWith('18:00'));
      if (index < 0) throw new Error('requested timestamp was unavailable');
      const next: Weather = {
        time: data.hourly.time[index],
        windSpeed: data.hourly.wind_speed_10m[index],
        windDirection: data.hourly.wind_direction_10m[index],
        source: 'ERA5 reanalysis via Open-Meteo',
        live: true,
      };
      setWeather(next);
      setWindSpeed(next.windSpeed);
      setWindDirection(next.windDirection);
    } catch (error) {
      setWeather(fallback);
      setWindSpeed(fallback.windSpeed);
      setWindDirection(fallback.windDirection);
      setWeatherError(error instanceof Error ? error.message : 'weather request failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadWeather(); }, [loadWeather]);

  const input = useMemo(() => ({ hour, windSpeed, windDirection, sourceRate, reduction }), [hour, windSpeed, windDirection, sourceRate, reduction]);
  const rows = useMemo(() => scenario(input), [input]);
  const summary = useMemo(() => scenarioSummary(input), [input]);
  const active = rows.find((row) => row.id === selected) ?? rows[0];
  const series = useMemo(() => Array.from({ length: 31 }, (_, index) => {
    const seriesHour = index * 0.05;
    return {
      hour: +seriesHour.toFixed(2),
      exposure: scenario({ ...input, hour: seriesHour }).find((row) => row.id === selected)?.exposure ?? 0,
    };
  }), [input, selected]);
  const max = Math.max(...rows.map((row) => row.exposure));
  const bearing = transportBearing(windDirection);

  function downloadScenario() {
    const payload = {
      ...summary,
      weather: { ...weather, provenanceUrl: 'https://open-meteo.com/en/docs/historical-weather-api' },
      benchmark: { source: benchmark.source, holdout: benchmark.holdout, skill: benchmark.skill },
      generatedAt: new Date().toISOString(),
    };
    const href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = 'phytoguard-scenario.json';
    anchor.click();
    URL.revokeObjectURL(href);
  }

  return <main>
    <header>
      <div className="identity"><span>PG</span><div><b>PHYTOGUARD</b><small>Airborne exposure workbench</small></div></div>
      <nav><a className="active" href="#scenario">Scenario</a><a href="#validation">Validation</a><a href="#provenance">Data notes</a></nav>
      <div className="dataset"><Database />NOAA CAPTEX + ERA5 <b>SOURCE FILES CHECKED</b></div>
    </header>

    <section className="shell" id="scenario">
      <aside className="controls">
        <div className="eyebrow">SCENARIO INPUTS</div><h1>Transport conditions</h1>
        <div className={`provenance ${weather.live ? '' : 'cached'}`} id="provenance"><CloudSun /><div><b>{loading ? 'Loading timestamped weather...' : weather.source}</b><small>{weather.time} · Bengaluru reference point</small>{weatherError && <small>Fallback used: {weatherError}</small>}</div><button aria-label="Reload ERA5 weather" title="Reload ERA5 weather" onClick={() => void loadWeather()}><RefreshCw /></button></div>
        <label>Wind speed <output>{windSpeed.toFixed(1)} km/h</output><input type="range" min="2" max="30" step="0.1" value={windSpeed} onChange={(event) => setWindSpeed(+event.target.value)} /></label>
        <label>Wind direction (from) <output>{Math.round(windDirection)}°</output><input type="range" min="0" max="359" value={windDirection} onChange={(event) => setWindDirection(+event.target.value)} /></label>
        <div className="derived"><span>Calculated transport bearing</span><b>{Math.round(bearing)}°</b><small>Wind travels toward the opposite bearing</small></div>
        <label>Relative release rate <output>{sourceRate} units/h</output><input type="range" min="10" max="200" value={sourceRate} onChange={(event) => setSourceRate(+event.target.value)} /></label>
        <div className="intervention"><div><SlidersHorizontal /><span><b>Source reduction scenario</b><small>Hypothetical control at source</small></span></div><output>{reduction}%</output><input aria-label="Source reduction" type="range" min="0" max="90" value={reduction} onChange={(event) => setReduction(+event.target.value)} /></div>
        <button className="export" onClick={downloadScenario}><Download />Download auditable result</button>
        <div className="limits"><AlertTriangle /><p><b>Transport evidence only.</b> The normalized index is not a field concentration and does not predict infection, yield loss, or treatment need.</p></div>
      </aside>

      <section className="map">
        <div className="mapbar"><div><div className="eyebrow">PUFF VIEW · +{hour.toFixed(2)} HOURS</div><h2>Receptor exposure</h2></div><div className="model-state"><i />RECOMPUTED <b>{summary.modelVersion}</b></div></div>
        <div className="maparea">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Scenario map with source and four receptor fields">
            <defs><linearGradient id="plume"><stop stopColor="#f1b757" stopOpacity=".65" /><stop offset="1" stopColor="#db7053" stopOpacity="0" /></linearGradient><pattern id="grid" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M 8 0 L 0 0 0 8" fill="none" stroke="#91a39b" strokeOpacity=".18" strokeWidth=".22" /></pattern></defs>
            <rect width="100" height="100" fill="url(#grid)" /><path d="M22,56 C42,37 68,31 98,39 C70,55 47,66 22,56Z" fill="url(#plume)" transform={`rotate(${bearing - 90} 22 56)`} /><path d="M0 75 C25 70 30 86 55 82 S80 74 100 80" fill="none" stroke="#729c9c" strokeWidth="1.5" opacity=".6" /><g className="roads"><path d="M10 15L90 92M4 44L95 48M35 3L33 97" /></g>
            {rows.map((row) => <g key={row.id} className={`receptor ${selected === row.id ? 'selected' : ''}`} onClick={() => setSelected(row.id)} onKeyDown={(event) => event.key === 'Enter' && setSelected(row.id)} role="button" tabIndex={0}><circle cx={row.x} cy={row.y} r={3 + Math.min(3, row.exposure / 12)} fill={row.exposure > 18 ? '#d85f45' : row.exposure > 5 ? '#e3a647' : '#4f8270'} /><circle cx={row.x} cy={row.y} r="1.1" fill="#fff" /><text x={row.x + 3.5} y={row.y - 3}>{row.id}</text></g>)}
            <g className="source-node"><circle cx="22" cy="56" r="4" /><path d="M19 56h6M22 53v6" /><text x="16" y="49">SOURCE S-01</text></g>
          </svg>
          <div className="windkey"><Wind /><span>transport toward</span><b>{Math.round(bearing)}°</b></div><div className="legend"><span><i className="low" />lower</span><span><i className="med" />moderate</span><span><i className="high" />higher</span></div>
        </div>
        <div className="timeline"><span>RELEASE</span><input aria-label="Elapsed transport time" type="range" min="0.05" max="1.5" step="0.05" value={hour} onChange={(event) => setHour(+event.target.value)} /><span>+1.5H</span><output>+{hour.toFixed(2)} h</output></div>
      </section>

      <aside className="results">
        <div className="eyebrow">RECEPTOR DETAIL</div><div className="receptor-title"><MapPin /><div><h2>{active.name}</h2><small>{active.id} · {active.crop} · {Math.hypot(active.eastKm, active.northKm).toFixed(1)} km</small></div></div>
        <div className="metric"><span>Relative exposure index</span><strong>{active.exposure.toFixed(2)}</strong><small>normalized Gaussian-puff output</small></div>
        <div className="audit-row"><span>Downwind</span><b>{active.downwindKm} km</b><span>Crosswind</span><b>{active.crosswindKm} km</b><span>Advective arrival</span><b>{active.arrivalHour} h</b></div>
        <div className="chart"><ResponsiveContainer width="100%" height={155}><AreaChart data={series}><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#df8352" stopOpacity=".55" /><stop offset="1" stopColor="#df8352" stopOpacity=".02" /></linearGradient></defs><CartesianGrid strokeDasharray="2 4" stroke="#d9d8d0" /><XAxis dataKey="hour" fontSize={9} tickFormatter={(value) => `${value}h`} /><YAxis fontSize={9} /><Tooltip /><Area type="monotone" dataKey="exposure" stroke="#b95740" fill="url(#area)" /></AreaChart></ResponsiveContainer></div>
        <div className="receptor-list">{rows.map((row) => <button key={row.id} className={selected === row.id ? 'active' : ''} onClick={() => setSelected(row.id)}><span><b>{row.id}</b><small>{row.name}</small></span><output>{row.exposure.toFixed(2)}</output></button>)}</div>
        <div className="validation weak" id="validation"><div><FlaskConical /><span><b>NOAA CAPTEX holdout</b><small>{benchmark.holdoutSamples} measured tracer samples</small></span><AlertTriangle /></div><dl><div><dt>Correlation</dt><dd>{benchmark.holdout.correlation}</dd></div><div><dt>RMSE log</dt><dd>{benchmark.holdout.rmseLog}</dd></div><div><dt>Skill vs zero</dt><dd>{benchmark.skill.rmseVsZeroPct}%</dd></div></dl><p><b>No predictive skill on the chronological holdout.</b> CAPTEX is shown as an applicability check, not a passed biological validation. The live scenario remains exploratory.</p></div>
        <div className="status"><CheckCircle2 /><span>Every input change recomputes all four receptors locally. Export includes inputs, units, model version, weather provenance, and benchmark status.</span></div>
      </aside>
    </section>
  </main>;
}
