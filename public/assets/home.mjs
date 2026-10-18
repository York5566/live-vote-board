import {defaults} from '../shared/model.mjs';
import {Board,demoVotes} from './board.mjs';
const config=defaults();config.mode='single';config.title='好點子，值得被看見。';config.subtitle='2026 創意生活提案 · 人氣票選';config.groups[0].name='大家的靈感選物';config.groups[0].candidates=config.groups[0].candidates.slice(0,3);config.groups[0].columns=3;config.appearance.title.size=49;
new Board(document.querySelector('#hero-board')).render(config,demoVotes(config),{demo:true});
