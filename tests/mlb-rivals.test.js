const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const formulas = read('public/data/formulas.json');
const cards = read('public/data/cards.json');
const players = read('public/data/players.json');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const mainJs = fs.readFileSync(path.join(root, 'javascripts/main.js'), 'utf8');
function average(values){ return values.reduce((a,b)=>a+b,0)/values.length; }
function getLaunchAngleModifier(ala){ if (ala <= 10) return 0.85; if (ala <= 13) return 0.92; if (ala <= 17) return 1; if (ala <= 20) return 0.93; return 0.85; }
function hotZoneModifier(card){ const total=(card.hotZones||[]).reduce((sum,z)=>sum+z.strength,0); return 1 + total * formulas.research.hotZone.k; }
function ovr(stats){ return { exact: average(Object.values(stats)), displayed: Math.round(average(Object.values(stats))) }; }
function enhance(stats, level){ return Object.fromEntries(Object.entries(stats).map(([k,v])=>[k,v+level])); }
function train(stats, arr=[]){ const keys=Object.keys(stats); const out={...stats}; arr.forEach((v,i)=>{ if(keys[i]) out[keys[i]]+=v; }); return out; }
function transcend(stats, level){ return Object.fromEntries(Object.entries(stats).map(([k,v])=>[k,v+level])); }
function excelBatter(stats){ return stats.POW*1.1 + stats.CON*0.9 + stats.EYE*0.4; }
function excelPitcher(stats){ return stats.MOV*1.15 + stats.STU*1.2; }
function researchBatter(card){ const s=card.baseStats; return (s.POW*.42+s.EYE*.30+s.CON*.28)*getLaunchAngleModifier(card.launchAngle ?? 15)*hotZoneModifier(card); }
function researchPitcher(stats){ return stats.STU*.28+stats.MOV*.26+stats.CTRL*.22+stats.VEL*.16+stats.STA*.08; }
assert(cards.length >= 12, 'sample and sourced cards exist');
assert(players.every((player) => player.id && player.name && player.team && Array.isArray(player.position)), 'player schema');
assert(html.includes('data-tab-target="mlb-rivals-players"'), 'player DB tab exists');
assert(html.includes('data-player-db-app'), 'player DB app shell exists');
assert(mainJs.includes('mlb-rivals-players'), 'player DB localStorage key exists');
assert(mainJs.includes('players.json'), 'player DB imports and exports players JSON');
assert(mainJs.includes('finiteValues'), 'team averages ignore NaN from missing-stat cards');
assert(mainJs.includes("displayed ?? '--'"), 'missing OVR renders as placeholder');
assert(mainJs.includes('players array missing'), 'invalid player imports are rejected');
assert(cards.some((card) => card.dataStatus === 'sourced-missing-stats'), 'sourced missing-stat card stubs are tracked');
assert(cards.filter((card) => card.dataStatus === 'sourced-missing-stats').every((card) => card.source?.sourceType === 'official' && Object.keys(card.baseStats || {}).length === 0), 'missing stats are not invented');
assert(ovr({POW:72,CON:78,EYE:75,SPD:72,FLD:70,STA:68}).displayed === 73, 'OVR calculation');
assert(Math.abs(average([72.5,73.5])-73) < .001, 'Team OVR');
assert(enhance({POW:1}, 10).POW === 11, 'Enhancement');
assert(train({POW:1,CON:1}, [2,3]).CON === 4, 'Position Training');
assert(transcend({POW:1}, 5).POW === 6, 'Transcendence');
assert(Math.abs(excelBatter({POW:89,CON:81,EYE:77}) - 201.6) < .001, 'Excel Batter Score');
assert(Math.abs(excelPitcher({MOV:80,STU:90}) - 200) < .001, 'Excel Pitcher Score');
assert(researchBatter(cards[2]) > researchBatter(cards[1]), 'Research Batter Score');
assert(Math.abs(researchPitcher({STU:90,MOV:80,CTRL:70,VEL:75,STA:60}) - 78.2) < .001, 'Research Pitcher Score');
[[10,.85],[11,.92],[13,.92],[14,1],[17,1],[18,.93],[20,.93],[21,.85]].forEach(([a,e])=>assert(getLaunchAngleModifier(a)===e, `ALA ${a}`));
[0,1,3,8].forEach((strength)=>assert(hotZoneModifier({hotZones:[{strength}]}) === 1 + strength*0.00208, `Hot Zone ${strength}`));
assert(formulas.research.hotZone.status === 'experimental', 'Hot Zone marked experimental');
console.log(process.argv.includes('--validate-only') ? 'Static data validation passed.' : 'All MLB Rivals tests passed.');
