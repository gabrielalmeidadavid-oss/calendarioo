// ============================================================
// SMARTAGENDA (versão enxuta, comentada linha por linha)
// ============================================================


// ===== AUXILIARES =====

// $ seleciona o primeiro elemento da página que bate com um seletor CSS. Ex.: $('#tl')
const $ = s => document.querySelector(s),
  // $id seleciona um elemento pelo id. Ex.: $id('caps')
  $id = s => document.getElementById(s),
  // esc troca caracteres especiais por entidades HTML (evita que texto digitado vire código HTML)
  esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
  // iso devolve a data no formato AAAA-MM-DD (o formato sueco 'sv-SE' é assim)
  iso = d => d.toLocaleDateString('sv-SE'),
  // hoje devolve a data de hoje em AAAA-MM-DD
  hoje = () => iso(new Date()),
  // nowMin devolve a hora atual em minutos desde 00:00 (14h30 = 870)
  nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); },
  // pad coloca zero à esquerda até ter 2 dígitos (5 vira "05")
  pad = n => String(n).padStart(2, '0'),
  // hm converte minutos em "HH:MM" (540 vira "09:00")
  hm = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60),
  // dur mostra uma duração legível: 90 vira "1h30"; 45 vira "45 min"
  dur = m => m >= 60 ? Math.floor(m / 60) + 'h' + (m % 60 ? pad(m % 60) : '') : m + ' min',
  // toMin converte "HH:MM" em minutos ("09:30" vira 570)
  toMin = v => { const [a, b] = v.split(':'); return +a * 60 + +b; },
  // uid cria um id único misturando a hora atual com letras/números aleatórios
  uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
  // DI = início da agenda (07:00 = 420 min), DF = fim (22:00 = 1320 min),
  // PX = pixels por minuto na linha do tempo, KEY = chave usada no LocalStorage
  DI = 420, DF = 1320, PX = .9, KEY = 'smartagenda:v1',   // 07:00, 22:00, px por minuto
  // rnd sorteia um número inteiro de 0 até n-1
  rnd = n => Math.floor(Math.random() * n);


// ===== DADOS =====

// S guarda TODOS os dados do app. Começa vazio (null)
let S = null;
// Tenta ler os dados salvos no navegador e transformar de texto JSON em objeto
try { S = JSON.parse(localStorage.getItem(KEY)); } catch {}   // se der erro, S continua null

// Se não havia nada salvo, cria os dados iniciais
if (!S) {
  S = {
    ev: {},        // eventos, separados por data
    lemb: [],      // lembretes (lista vazia)
    md: '',        // data do último reset diário
    tema: null,    // tema escolhido (ainda nenhum)
    tarefas: [     // tarefas iniciais; f = 0 significa "não feita"
      { t: 'Revisar a aula de HTML e CSS', f: 0 },
      { t: 'Avançar no projeto pessoal', f: 0 },
      { t: 'Separar a roupa de treino', f: 0 }
    ],
    metas: [       // n = nome, un = unidade, alvo = objetivo, v = progresso, passo = quanto soma por clique
      { n: 'Estudar', un: 'min', alvo: 60, v: 0, passo: 25 },
      { n: 'Exercício', un: 'min', alvo: 30, v: 0, passo: 15 },
      { n: 'Leitura', un: 'min', alvo: 20, v: 0, passo: 10 }
    ]
  };
  // Eventos de exemplo para hoje (i = início e f = fim, em minutos; c = classe CSS)
  S.ev[hoje()] = [
    { id: uid(), t: 'Aula online', i: 540, f: 660, c: 'ev' },        // 09:00 às 11:00
    { id: uid(), t: 'Almoço', i: 720, f: 780, c: 'ev' },             // 12:00 às 13:00
    { id: uid(), t: 'Reunião do grupo', i: 930, f: 990, c: 'ev' }    // 15:30 às 16:30
  ];
}

// Novo dia: zera metas e lembretes
if (S.md !== hoje()) {                    // se o último reset não foi hoje...
  S.metas.forEach(m => m.v = 0);          // ...zera o progresso de cada meta
  S.lemb.forEach(l => l.ok = 0);          // ...desmarca todos os lembretes
  S.md = hoje();                          // ...e registra que o reset de hoje já foi feito
}

// save grava S no navegador (objeto vira texto JSON); o try ignora erros, como armazenamento cheio
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
// dia = o dia que está sendo exibido na agenda (começa em hoje)
let dia = hoje();


// ===== TEMA =====

// setTema aplica o tema 't' ('dark' ou 'light')
function setTema(t) {
  S.tema = t;                                       // guarda a escolha nos dados
  document.documentElement.dataset.tema = t;        // põe data-tema="..." na tag <html> (o CSS usa isso)
  document.querySelectorAll('#tema, #tema2').forEach(el =>     // para os dois botões de tema...
    el.textContent = t === 'dark' ? 'Modo claro' : 'Modo escuro');   // ...mostra a opção oposta
  save();                                           // salva a preferência
}
// Aplica o tema salvo; se não houver, usa a preferência do sistema (claro ou escuro)
setTema(S.tema || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));


// ===== AGENDA =====

// evs devolve a lista de eventos do dia 'd' (cria vazia se não existir) já ordenada por horário de início
const evs = d => (S.ev[d] = S.ev[d] || []).sort((a, b) => a.i - b.i);

// addEv adiciona um evento. Devolve texto de erro se algo estiver errado
function addEv(d, t, i, f, c = 'ev') {
  // Sem título, ou fim que não é depois do início: erro
  if (!t || !(f > i)) return 'Preencha o nome e use um fim depois do início.';
  // Procura um evento que se sobreponha ao novo (começa antes do fim dele e termina depois do início dele)
  const x = evs(d).find(e => i < e.f && f > e.i);
  // Se achou, avisa qual é o conflito
  if (x) return `Conflito com “${x.t}” (${hm(x.i)} às ${hm(x.f)}).`;
  evs(d).push({ id: uid(), t, i, f, c });   // sem conflito: adiciona o evento
  save();                                   // salva
  render();                                 // redesenha a tela
}

// Períodos livres (mín. 15 min) entre 07:00 e 22:00
function livres(d) {
  // c = ponto de partida. Se for hoje, começa na hora atual (arredondada para 5 min), nunca antes das 07:00
  let c = d === hoje() ? Math.max(DI, Math.ceil(nowMin() / 5) * 5) : DI;
  const out = [];                                       // lista de brechas encontradas
  for (const e of evs(d)) {                             // para cada evento, em ordem...
    if (e.i > c && c < DF) out.push([c, Math.min(e.i, DF)]);   // se há espaço antes dele, guarda a brecha
    c = Math.max(c, e.f);                               // avança c para o fim do evento
  }
  if (c < DF) out.push([c, DF]);                        // sobrou tempo até as 22:00? guarda a última brecha
  return out.filter(([a, b]) => b - a >= 15);           // só devolve brechas de 15 min ou mais
}


// ===== ANIMAÇÕES =====

// vistos lembra quais itens já foram desenhados, para animar só os novos
const vistos = new Set(),
  // nv: se a chave k é nova, devolve a classe ' nv' (anima) e a registra; senão devolve texto vazio
  nv = k => { const n = !vistos.has(k); vistos.add(k); return n ? ' nv' : ''; },
  // sair toca a animação de saída (classe 'sai') e só executa fn depois de 260 ms
  sair = (el, fn) => { if (!el) return fn(); el.classList.add('sai'); setTimeout(fn, 260); },
  // reduz = true se a pessoa pediu menos animações no sistema (acessibilidade)
  reduz = matchMedia('(prefers-reduced-motion: reduce)').matches;


// ===== RENDER =====

// ultDia = último dia desenhado (serve para detectar troca de dia)
let ultDia = null;

// rAgenda desenha a faixa da semana, o título do dia e a linha do tempo
function rAgenda() {
  const base = new Date(dia + 'T12:00'), ini = new Date(base);   // base = dia selecionado às 12h (evita erro de fuso); ini = cópia
  ini.setDate(base.getDate() - base.getDay());                   // volta até o domingo da semana (getDay: 0 = domingo)

  let h = '';                                  // HTML dos 7 botões da semana
  for (let i = 0; i < 7; i++) {                // repete para os 7 dias
    const d = new Date(ini);                   // copia o domingo
    d.setDate(ini.getDate() + i);              // soma i dias
    const k = iso(d),                          // k = data AAAA-MM-DD
      nome = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),   // nome do dia abreviado, sem ponto
      marca = (S.ev[k] || []).length ? '<i></i>' : '';   // bolinha se o dia tem compromissos
    // Monta o botão: "on" = dia selecionado, "hj" = hoje, data-d guarda a data para o clique
    h += `<button type="button" class="dd${k === dia ? ' on' : ''}${k === hoje() ? ' hj' : ''}" data-d="${k}"><span>${nome}</span><b>${d.getDate()}</b>${marca}</button>`;
  }
  const sem = $('#semana');                                      // contêiner da semana
  if (sem.dataset.h !== h) { sem.innerHTML = h; sem.dataset.h = h; }   // só redesenha se algo mudou

  // Título do dia por extenso (ex.: "quinta-feira, 5 de novembro")
  $('#dtitulo').textContent = base.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  if (ultDia && ultDia !== dia) {              // se o dia mudou desde o último desenho...
    vistos.clear();                            // ...esquece o que já foi visto (tudo anima de novo)
    const tl = $('#tl');                       // linha do tempo
    tl.classList.remove('troca');              // tira a classe da animação...
    void tl.offsetWidth;                       // ...força o navegador a recalcular o layout...
    tl.classList.add('troca');                 // ...e põe de volta, reiniciando a animação
  }
  ultDia = dia;                                // guarda o dia atual como "último dia"

  let t = '';                                  // HTML da linha do tempo
  for (let m = DI; m <= DF; m += 60)           // uma linha por hora, de 07:00 a 22:00
    t += `<div class="hr" style="top:${(m - DI) * PX}px"><span>${hm(m)}</span></div>`;   // top = posição vertical em px

  livres(dia).forEach(([a, b]) => {            // para cada brecha livre do dia...
    // ...cria um botão clicável posicionado e dimensionado pela hora (altura = duração * PX - 2px)
    t += `<button type="button" class="lv${nv('l' + dia + a + '-' + b)}" data-a="${a}" data-b="${b}" style="top:${(a - DI) * PX}px;height:${(b - a) * PX - 2}px"><b>Livre</b> ${hm(a)} às ${hm(b)}, ${dur(b - a)}</button>`;
  });

  const n = nowMin();                          // hora atual em minutos
  if (dia === hoje() && n >= DI && n <= DF)    // se é hoje e a hora está dentro da agenda...
    t += `<div class="nw" style="top:${(n - DI) * PX}px"><em>agora</em></div>`;   // ...desenha a linha "agora"

  evs(dia).forEach(e => {                      // para cada compromisso do dia...
    // ...desenha o bloco (altura mínima de 24px) com título, horário e botão × para remover
    t += `<div class="ev ${e.c}${nv('e' + e.id)}" style="top:${(e.i - DI) * PX}px;height:${Math.max((e.f - e.i) * PX - 2, 24)}px"><span>${esc(e.t)}</span><small>${hm(e.i)} às ${hm(e.f)}</small><button type="button" data-x="${e.id}" aria-label="Remover ${esc(e.t)}">×</button></div>`;
  });

  $('#tl').innerHTML = t;                              // coloca tudo na tela
  $('#tl').style.height = (DF - DI) * PX + 'px';       // altura total da linha do tempo
}

// rolar leva a barra de rolagem até a hora atual (hoje) ou ao primeiro compromisso
function rolar() {
  const w = $('#tlw');                         // contêiner com barra de rolagem
  if (!w) return;                              // se não existir, sai
  const lista = evs(dia),                      // eventos do dia
    alvo = dia === hoje() ? nowMin() : (lista.length ? lista[0].i : DI);   // hoje: agora; senão: 1º evento (ou 07:00)
  w.scrollTop = Math.max(0, (alvo - DI) * PX - 80);   // rola até o alvo, com 80px de folga acima
}

// rMetas desenha o painel de metas diárias
function rMetas() {
  $('#resetMetas').disabled = S.metas.every(m => m.v === 0);   // desativa "Zerar" se todas já estão em 0
  $('#metas').innerHTML = S.metas.map((m, i) => {              // para cada meta, monta um bloco HTML
    const p = Math.min(100, Math.round(m.v / m.alvo * 100)),   // p = porcentagem (máx. 100)
      sem = nv('m' + i) ? '' : 'animation:none;';              // se já foi animada, desliga a animação
    // Bloco: nome, progresso (ex.: 25/60 min), barra e botão "+passo". "feita" quando bate o alvo
    return `<div class="meta${m.v >= m.alvo ? ' feita' : ''}" style="--k:${i};${sem}">
      <div><b>${esc(m.n)}</b><span>${m.v}/${m.alvo} ${esc(m.un)}</span></div>
      <div class="bar"><i style="width:${p}%"></i></div>
      <button type="button" data-m="${i}" aria-label="Adicionar ${m.passo} ${esc(m.un)} em ${esc(m.n)}">+${m.passo}</button>
    </div>`;
  }).join('');                                 // junta todos os blocos num só texto
}

// rTarefas desenha a lista de tarefas
function rTarefas() {
  $('#tarefas').innerHTML = S.tarefas.length   // se há tarefas...
    ? S.tarefas.map((x, i) => `<li class="${x.f ? 'ok' : ''}${nv('t' + i + x.t)}" style="--k:${i}">
        <label><input type="checkbox" data-t="${i}" ${x.f ? 'checked' : ''}><span>${esc(x.t)}</span></label>
        <button type="button" data-dt="${i}" aria-label="Remover tarefa">×</button>
      </li>`).join('')                         // ...um <li> para cada (classe "ok" = riscada)
    : '<li class="vz">Nenhuma tarefa. Adicione a primeira!</li>';   // ...senão, mensagem de lista vazia
}

// rLemb desenha a lista de lembretes
function rLemb() {
  const lista = [...S.lemb].sort((a, b) => a.h - b.h);   // copia e ordena por horário, sem mexer na lista original
  $('#lemb').innerHTML = lista.length                    // se há lembretes...
    ? lista.map((l, i) => `<li class="${l.ok ? 'ok' : ''}${nv('l' + l.id)}" style="--k:${i}">
        <label><input type="checkbox" data-l="${l.id}" ${l.ok ? 'checked' : ''}><span><b>${hm(l.h)}</b> ${esc(l.t)}</span></label>
        <button type="button" data-dl="${l.id}" aria-label="Remover lembrete">×</button>
      </li>`).join('')                                   // ...um <li> para cada, com horário em negrito
    : '<li class="vz">Nenhum lembrete por enquanto.</li>';   // ...senão, mensagem de vazio
}

// ultPct = última porcentagem de progresso (para detectar quando chega a 100%)
let ultPct = null;

// rProg calcula e mostra o progresso geral do dia
function rProg() {
  const itens = [                                        // cada item vale de 0 a 1
    ...S.metas.map(m => Math.min(1, m.v / m.alvo)),      // metas: fração concluída
    ...S.tarefas.map(x => x.f ? 1 : 0),                  // tarefas: 1 se feita
    ...S.lemb.map(l => l.ok ? 1 : 0)                     // lembretes: 1 se feito
  ];
  const total = itens.length,                            // quantidade de itens
    pct = total ? Math.round(itens.reduce((a, b) => a + b, 0) / total * 100) : 0,   // média em %
    feitos = itens.filter(v => v >= 1).length;           // itens 100% concluídos

  $('#pv').textContent = pct + '%';                      // número da porcentagem
  $('#pb').style.width = pct + '%';                      // largura da barra
  $('#pg').setAttribute('aria-valuenow', pct);           // valor para leitores de tela

  // Emoji de humor conforme a faixa do progresso
  const humor = ['😴', '🙂', '😎', '🤩', '🏆'][pct === 0 ? 0 : pct < 40 ? 1 : pct < 70 ? 2 : pct < 100 ? 3 : 4];
  $('#pt').textContent = `${humor} ${feitos} de ${total} itens concluídos hoje`;   // texto resumo

  if (ultPct !== null && ultPct < 100 && pct === 100) {  // acabou de chegar a 100%?
    confete();                                           // chuva de confete
    toast('100% do dia! Você é demais 🏆');              // aviso de parabéns
  }
  ultPct = pct;                                          // guarda para a próxima comparação
}

// render redesenha todos os painéis
function render() { rAgenda(); rMetas(); rTarefas(); rLemb(); rProg(); }


// ===== TOAST (aviso rápido) =====

let tt = 0;                                    // id do temporizador que esconde o aviso
function toast(msg) {
  const el = $('#toast');                      // elemento do aviso
  el.textContent = msg;                        // define a mensagem
  el.classList.add('show');                    // mostra (o CSS faz a animação)
  clearTimeout(tt);                            // cancela o temporizador anterior
  tt = setTimeout(() => el.classList.remove('show'), 2800);   // esconde após 2,8 s
}


// ===== CLIQUES E FORMULÁRIOS =====

// Um único "ouvinte" de cliques para a página toda; descobre o que foi clicado pelo id ou data-*
document.addEventListener('click', ev => {
  // Logo: encerra a sessão e volta ao login
  if (ev.target.closest('.logo')) {            // clicou na logo (ou dentro dela)?
    ev.preventDefault();                       // impede o link de rolar a página
    localStorage.removeItem('sessao');         // apaga a sessão salva
    location.reload();                         // recarrega a página (volta ao login)
    return;
  }

  const b = ev.target.closest('button');       // acha o botão clicado
  if (!b) return;                              // se não foi botão, ignora
  const d = b.dataset;                         // atalho para os atributos data-*

  if (b.id === 'frase') return novaFrase();    // botão da frase: sorteia outra

  if (b.id === 'sorteio') {                    // botão de sorteio de tarefa
    const pend = S.tarefas.filter(x => !x.f);  // tarefas pendentes
    // Se há pendentes, sorteia uma; senão, manda descansar
    return toast(pend.length ? '🎲 Hora de: ' + pend[rnd(pend.length)].t : 'Nada pendente! Vai descansar 😎');
  }

  // Botões de tema: alterna entre escuro e claro
  if (b.id === 'tema' || b.id === 'tema2') return setTema(S.tema === 'dark' ? 'light' : 'dark');

  if (b.id === 'fgo') return iniciar();        // iniciar/pausar o foco
  if (b.id === 'frs') return trocarModo(modo); // zerar o foco (reinicia o modo atual)
  if (d.modo) return trocarModo(d.modo);       // escolher o modo (foco/pausa/longa)

  if (b.id === 'expo') return exportar();      // baixar backup
  if (b.id === 'impb') return $('#imp').click();   // abre o seletor de arquivo escondido

  if (b.id === 'resetMetas') {                 // zerar metas
    if (!confirm('Zerar o progresso de todas as metas de hoje?')) return;   // pergunta antes
    S.metas.forEach(m => m.v = 0);             // zera cada meta
    save();                                    // salva
    vistos.clear();                            // permite animar de novo
    rMetas();                                  // redesenha metas
    rProg();                                   // atualiza progresso geral
    return toast('Metas zeradas');             // avisa
  }

  // Semana anterior/próxima (data-w) ou escolher dia (data-d)
  if (d.w || d.d) {
    if (d.w) {                                 // botão de semana: d.w vale -7 ou 7
      const x = new Date(dia + 'T12:00');      // dia atual como data
      x.setDate(x.getDate() + Number(d.w));    // anda 7 dias para trás ou para frente
      dia = iso(x);                            // atualiza o dia exibido
    } else dia = d.d;                          // botão de dia: usa a data dele
    rAgenda();                                 // redesenha a agenda
    return rolar();                            // e rola até o ponto certo
  }

  // Bloco livre: preenche o formulário (fim sugerido: até 1h)
  if (d.a) {
    const a = Number(d.a);                     // início da brecha em minutos
    $('#ei').value = hm(a);                    // preenche o campo de início
    $('#ef').value = hm(Math.min(Number(d.b), a + 60));   // fim: no máximo 1h depois do início
    $('#erro').textContent = '';               // limpa mensagem de erro
    return $('#et').focus();                   // cursor no campo do nome
  }

  // Remover compromisso: toca a animação de saída e depois apaga
  if (d.x) return sair(b.closest('.ev'), () => {
    S.ev[dia] = evs(dia).filter(e => e.id !== d.x);   // mantém todos menos o removido
    save();
    render();
  });

  // Somar progresso numa meta
  if (d.m) {
    const m = S.metas[d.m], antes = m.v;       // m = a meta; antes = progresso anterior
    m.v = Math.min(m.alvo, m.v + m.passo);     // soma o passo, sem passar do alvo
    save();
    rMetas();
    rProg();
    if (antes < m.alvo && m.v >= m.alvo) toast(`Meta “${m.n}” concluída! 🎉`);   // comemora ao bater o alvo
    return;
  }

  // Remover tarefa
  if (d.dt) return sair(b.closest('li'), () => {
    S.tarefas.splice(Number(d.dt), 1);         // remove 1 item na posição indicada
    save();
    vistos.clear();
    rTarefas();
    rProg();
  });

  // Remover lembrete
  if (d.dl) sair(b.closest('li'), () => {
    S.lemb = S.lemb.filter(l => l.id !== d.dl);   // mantém todos menos o removido
    save();
    rLemb();
    rProg();
  });
});

// Marcar/desmarcar tarefas e lembretes (escuta mudanças em qualquer checkbox)
document.addEventListener('change', ev => {
  const c = ev.target;                                                              // o campo que mudou
  if (c.dataset.t !== undefined) S.tarefas[c.dataset.t].f = c.checked ? 1 : 0;      // checkbox de tarefa: 1 se marcado
  else if (c.dataset.l) S.lemb.find(l => l.id === c.dataset.l).ok = c.checked ? 1 : 0;   // checkbox de lembrete: acha pelo id
  else return;                                                                      // outro campo: ignora
  c.closest('li').classList.toggle('ok', c.checked);   // liga/desliga o riscado no <li>
  save();                                              // salva
  rProg();                                             // atualiza o progresso
});

// Formulário de novo compromisso
$('#fev').addEventListener('submit', ev => {
  ev.preventDefault();                                 // não recarrega a página
  const i = toMin($('#ei').value), f = toMin($('#ef').value);   // início e fim em minutos
  // Fora do horário da agenda: mostra erro
  if (i < DI || f > DF) return $('#erro').textContent = 'Use horários entre 07:00 e 22:00.';
  const erro = addEv(dia, $('#et').value.trim(), i, f);   // tenta adicionar (devolve texto de erro ou nada)
  $('#erro').textContent = erro || '';                 // mostra o erro, ou limpa
  if (!erro) {                                         // deu certo?
    $('#et').value = '';                               // limpa o nome
    toast('Compromisso adicionado');                   // avisa
  }
});

// Formulário de nova tarefa
$('#ftar').addEventListener('submit', ev => {
  ev.preventDefault();
  const t = $('#tt').value.trim();                     // texto sem espaços nas pontas
  if (!t) return;                                      // vazio: ignora
  S.tarefas.push({ t, f: 0 });                         // adiciona como pendente
  $('#tt').value = '';                                 // limpa o campo
  save();
  rTarefas();
  rProg();
});

// Formulário de novo lembrete
$('#flem').addEventListener('submit', ev => {
  ev.preventDefault();
  const t = $('#lt').value.trim();                     // texto do lembrete
  if (!t || !$('#lh').value) return;                   // exige texto e horário
  S.lemb.push({ id: uid(), t, h: toMin($('#lh').value), ok: 0 });   // adiciona (h = horário em minutos)
  $('#lt').value = '';                                 // limpa texto
  $('#lh').value = '';                                 // limpa horário
  save();
  rLemb();
  rProg();
});


// ===== FRASES E CONFETE =====

// Frases motivacionais exibidas no botão do topo
const FRASES = [
  'Quem não marca compromisso, marca bobeira.',
  'Procrastinar amanhã é uma ótima ideia para hoje.',
  'Tempo livre: o único luxo que não custa nada.',
  'Agenda cheia, café vazio. Reabasteça!',
  'Você não está atrasado, o relógio que está adiantado.',
  'Pequenos passos também chegam ao 100%.',
  'Hoje é um ótimo dia para riscar algo da lista.',
  'Descansar também é compromisso.'
];

// novaFrase troca a frase por outra aleatória diferente da atual
function novaFrase() {
  const el = $('#frase');                              // elemento da frase
  let f;                                               // frase sorteada
  do f = FRASES[rnd(FRASES.length)]; while (f === el.textContent);   // sorteia até ser diferente da atual
  el.textContent = f;                                  // mostra
}
// Frase de abertura muda por dia (usa o dia do mês como índice)
$('#frase').textContent = FRASES[new Date().getDate() % FRASES.length];

// confete cria 60 pedacinhos coloridos caindo
function confete() {
  if (reduz) return;                                   // respeita quem prefere menos movimento
  const cores = ['#ffd23f', '#1d4ed8', '#15803d', '#c2410c', '#0f766e', '#ec4899'];   // paleta
  for (let i = 0; i < 60; i++) {
    const c = document.createElement('i');             // cria um elemento <i>
    c.className = 'conf';                              // classe CSS do confete
    c.style.left = Math.random() * 100 + 'vw';         // posição horizontal aleatória
    c.style.background = cores[i % cores.length];      // cor alternando pela paleta
    c.style.setProperty('--dx', (Math.random() * 200 - 100) + 'px');   // deslocamento lateral aleatório
    c.style.setProperty('--rt', (Math.random() * 720 - 360) + 'deg');  // rotação aleatória
    c.style.animationDelay = Math.random() * 0.6 + 's';                // atraso aleatório
    document.body.appendChild(c);                      // põe na página
    setTimeout(() => c.remove(), 3400);                // remove após a animação
  }
}


// ===== FOCO (POMODORO) =====

S.foco = S.foco || { hist: {} };                       // histórico de foco (minutos por dia); cria se não existir
const MODOS = { foco: 25, pausa: 5, longa: 15 };       // duração de cada modo, em minutos
// modo = modo atual; restante = segundos que faltam; fim = momento (ms) em que acaba;
// rodando = se está contando; tf = id do setInterval
let modo = 'foco', restante = MODOS.foco * 60, fim = 0, rodando = false, tf = 0;

// mmss converte segundos em "MM:SS" (1500 vira "25:00")
const mmss = s => pad(Math.floor(s / 60)) + ':' + pad(s % 60);

// rFoco atualiza tudo no painel de foco
function rFoco() {
  $('#ftm').textContent = mmss(restante);                        // mostra o tempo restante
  $('#ftm').classList.toggle('rodando', rodando);                // efeito visual enquanto conta
  // Texto do botão: Pausar (contando), Continuar (pausado no meio) ou Iniciar (parado no começo)
  $('#fgo').textContent = rodando ? 'Pausar' : restante < MODOS[modo] * 60 ? 'Continuar' : 'Iniciar';
  // Marca como pressionado o botão do modo atual
  document.querySelectorAll('[data-modo]').forEach(b => b.setAttribute('aria-pressed', b.dataset.modo === modo));

  const m = S.foco.hist[hoje()] || 0, s = Math.floor(m / 25);   // m = minutos de foco hoje; s = sessões de 25 min
  $('#fin').textContent = `🍅 ${s} ${s === 1 ? 'sessão' : 'sessões'} hoje · ${dur(m)} de foco`;   // resumo do dia
  document.title = rodando ? mmss(restante) + ' · SmartAgenda' : 'SmartAgenda';   // contagem na aba do navegador
}

// bip toca um som curto sem precisar de arquivo de áudio
function bip() {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)(),   // "mesa de som" do navegador
      o = a.createOscillator(), g = a.createGain();                        // o = gerador de onda; g = volume
    o.connect(g);                          // liga o gerador ao volume
    g.connect(a.destination);              // liga o volume às caixas de som
    g.gain.value = .15;                    // volume baixo
    o.frequency.value = 880;               // nota Lá agudo
    o.start();                             // começa a tocar
    o.stop(a.currentTime + .4);            // para após 0,4 s
  } catch {}                               // sem áudio: ignora
}

// trocarModo muda o modo e reinicia o relógio nele
function trocarModo(m) {
  clearInterval(tf);                       // para a contagem em andamento
  rodando = false;                         // marca como parado
  modo = m;                                // novo modo
  restante = MODOS[m] * 60;                // tempo do modo, em segundos
  rFoco();                                 // atualiza a tela
}

// iniciar começa ou pausa a contagem
function iniciar() {
  if (rodando) {                           // se está contando: pausa
    clearInterval(tf);
    rodando = false;
  } else {                                 // se está parado: começa
    fim = Date.now() + restante * 1000;    // calcula o instante de término
    rodando = true;
    tf = setInterval(tick, 250);           // confere a cada 250 ms
  }
  rFoco();
}

// tick roda a cada 250 ms enquanto o timer está ativo
function tick() {
  restante = Math.max(0, Math.ceil((fim - Date.now()) / 1000));   // segundos que faltam (nunca negativo)
  if (restante === 0) return fimContagem();                       // chegou a zero: encerra
  rFoco();                                                        // senão, atualiza a tela
}

// fimContagem é chamada quando o tempo acaba
function fimContagem() {
  bip();                                   // toca o som
  if (modo === 'foco') {                   // acabou uma sessão de foco
    S.foco.hist[hoje()] = (S.foco.hist[hoje()] || 0) + MODOS.foco;   // soma 25 min no histórico de hoje
    save();
    rDados();                              // atualiza gráfico e sequência
    toast('Sessão de foco concluída! 🍅 Hora da pausa');
    trocarModo('pausa');                   // vai para a pausa (sem iniciar sozinha)
  } else {                                 // acabou uma pausa
    toast('Pausa acabou! Bora focar 💪');
    trocarModo('foco');                    // volta ao foco
  }
}


// ===== SUA SEMANA (GRÁFICO, SEQUÊNCIA, BACKUP) =====

// rDados desenha o gráfico dos últimos 7 dias, a sequência e o total
function rDados() {
  const hist = S.foco.hist, dias = [];     // hist = minutos por data; dias = lista dos últimos 7 dias
  let total = 0, max = 1;                  // total = soma; max = maior dia (começa em 1 para não dividir por zero)

  for (let i = 6; i >= 0; i--) {           // do dia mais antigo (6 dias atrás) até hoje
    const d = new Date();
    d.setDate(d.getDate() - i);            // volta i dias
    const m = hist[iso(d)] || 0;           // minutos de foco daquele dia
    dias.push([iso(d), m, d]);             // guarda [data, minutos, objeto Date]
    total += m;                            // soma ao total
    max = Math.max(max, m);                // atualiza o maior valor
  }

  // Desenha as barras: altura proporcional ao maior dia (até 70%), mínimo 10% se houver foco; hoje usa outra cor
  $('#hb').innerHTML = dias.map(([k, m, d]) =>
    `<div title="${dur(m)}"><i style="height:${m ? Math.max(m / max * 70, 10) : 0}%;${k === hoje() ? 'background:var(--ok)' : ''}"></i>${d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').slice(0, 3)}</div>`
  ).join('');

  // Sequência de dias com foco (se hoje ainda não teve, conta a partir de ontem)
  let seq = 0;                             // contador da sequência
  const d = new Date();                    // começa em hoje
  if (!(hist[iso(d)] > 0)) d.setDate(d.getDate() - 1);          // hoje sem foco? começa em ontem
  while (hist[iso(d)] > 0) { seq++; d.setDate(d.getDate() - 1); }   // anda para trás enquanto houver foco

  $('#seq').textContent = seq              // texto da sequência
    ? `🔥 ${seq} ${seq === 1 ? 'dia seguido' : 'dias seguidos'}`
    : 'Faça uma sessão de foco para começar a sequência!';
  $('#dtot').textContent = `Total dos últimos 7 dias: ${dur(total)} de foco`;   // total da semana
}

// exportar baixa os dados como arquivo .json
function exportar() {
  const a = document.createElement('a');   // link invisível (não vai para a página)
  // Cria um "arquivo" na memória com o JSON indentado e gera um endereço temporário para ele
  a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
  a.download = 'smartagenda-backup.json';  // nome do arquivo baixado
  a.click();                               // simula o clique (dispara o download)
  URL.revokeObjectURL(a.href);             // libera a memória do endereço temporário
  toast('Backup baixado');
}

// Restaurar backup: roda quando o usuário escolhe um arquivo
$('#imp').addEventListener('change', e => {
  const f = e.target.files[0];             // arquivo escolhido
  if (!f) return;                          // nenhum: sai
  f.text().then(t => {                     // lê o conteúdo como texto
    try {
      const d = JSON.parse(t);             // transforma em objeto
      // Validação básica: precisa ter "ev" (objeto) e "tarefas" (lista); senão lança erro de propósito
      if (!d || typeof d.ev !== 'object' || !Array.isArray(d.tarefas)) throw 0;
      S = d;                               // troca os dados atuais pelos do backup
      save();                              // salva
      location.reload();                   // recarrega a página
    } catch {
      toast('Arquivo de backup inválido'); // arquivo estragado ou errado
    }
  });
  e.target.value = '';                     // limpa o input (permite escolher o mesmo arquivo de novo)
});


// ===== INÍCIO =====

render();                                  // desenha agenda, metas, tarefas, lembretes e progresso
rFoco();                                   // desenha o painel de foco
rDados();                                  // desenha o gráfico da semana

// A cada 30 s: atualiza "agora" e avisa lembretes na hora certa
const avisados = new Set();                // ids de lembretes já avisados (evita repetir)
setInterval(() => {
  rAgenda();                               // move a linha "agora" e atualiza as brechas
  if ($('#plataforma').style.display !== 'block') return;   // se a plataforma não está visível, não avisa
  S.lemb.forEach(l => {                    // para cada lembrete...
    if (!l.ok && l.h === nowMin() && !avisados.has(l.id)) {   // ...pendente, na hora exata e ainda não avisado
      avisados.add(l.id);                  // registra que avisou
      toast('Lembrete: ' + l.t);           // mostra o aviso
    }
  });
}, 30000);                                 // 30000 ms = 30 segundos


// ===== CADASTRO E LOGIN (LocalStorage) =====

// lerCadastro devolve a conta salva, ou null se não existir/estiver corrompida
function lerCadastro() {
  try { return JSON.parse(localStorage.getItem('cadastro')); } catch { return null; }
}

// tremer faz o formulário balançar (feedback de erro)
function tremer(id) {
  const f = $id(id);                       // elemento do formulário
  f.classList.remove('treme');             // tira a classe da animação
  void f.offsetWidth;                      // força recálculo do layout
  f.classList.add('treme');                // põe de volta (reinicia a animação)
}

// mostrarMensagem escreve uma mensagem; ok = true deixa verde, false deixa vermelha
function mostrarMensagem(texto, ok, id) {
  const m = $id(id || 'mensagem');         // sem id, usa a mensagem do login
  m.textContent = texto;                   // escreve o texto
  m.className = 'msg' + (ok ? ' ok' : ''); // classe "ok" muda para verde
  if (!ok && texto !== '') tremer(id === 'mensagemCad' ? 'painelCad' : 'painelLogin');   // erro: treme o painel certo
}

// limparMensagens apaga as mensagens dos dois formulários
function limparMensagens() {
  ['mensagem', 'mensagemCad'].forEach(id => {
    const m = $id(id);
    m.textContent = '';
    m.className = 'msg';
  });
}

// aba alterna entre "Entrar" e "Criar conta"
function aba(nome) {
  const login = nome === 'login';                          // true se vai para a aba de login
  limparMensagens();                                       // limpa mensagens antigas
  $id('painelLogin').hidden = !login;                      // mostra/esconde o painel de login
  $id('painelCad').hidden = login;                         // mostra/esconde o de cadastro
  $id('abaLogin').setAttribute('aria-selected', login);    // estado da aba para leitores de tela
  $id('abaCad').setAttribute('aria-selected', !login);
  $id('abaLogin').tabIndex = login ? 0 : -1;               // só a aba ativa entra na ordem do Tab
  $id('abaCad').tabIndex = login ? -1 : 0;
  $id(login ? 'loginUsuario' : 'cadNome').focus();         // cursor no primeiro campo do painel aberto
}

// togglePw mostra ou oculta a senha
function togglePw(id, botao) {
  const campo = $id(id), ver = campo.type === 'password';  // ver = a senha está oculta agora?
  campo.type = ver ? 'text' : 'password';                  // alterna entre texto e bolinhas
  botao.textContent = ver ? 'Ocultar' : 'Mostrar';         // atualiza o texto do botão
}

// Força da senha (0 a 4)
function forca() {
  const s = $id('cadSenha').value;                         // senha digitada
  // Soma 1 ponto por critério: 8+ caracteres, maiúscula E minúscula, número, símbolo
  let n = (s.length >= 8) + (/[a-z]/.test(s) && /[A-Z]/.test(s)) + /\d/.test(s) + /[^A-Za-z0-9]/.test(s);
  // Vazia = 0; menos de 6 caracteres = no máximo 1; senão, pelo menos 1
  n = s === '' ? 0 : s.length < 6 ? 1 : Math.max(1, n);
  $id('forca').dataset.n = n;                              // o CSS pinta as barrinhas conforme data-n
  $id('forcaTxt').textContent = ['', 'Senha fraca', 'Senha razoável', 'Senha boa', 'Senha forte'][n];   // texto do nível
}

// cadastrar cria a conta a partir do formulário
function cadastrar() {
  const nome = $id('cadNome').value.trim(),                // lê os campos (trim tira espaços das pontas)
    email = $id('cadEmail').value.trim(),
    usuario = $id('cadUsuario').value.trim(),
    senha = $id('cadSenha').value;                         // senha sem trim

  if (!nome || !email || !usuario || !senha)               // algum campo vazio?
    return mostrarMensagem('Preencha todos os campos!', false, 'mensagemCad');
  if (!/^\S+@\S+\.\S+$/.test(email))                       // e-mail fora do formato texto@texto.texto?
    return mostrarMensagem('Digite um e-mail válido!', false, 'mensagemCad');

  // Só existe UMA conta por navegador; a senha fica em texto puro (apenas para estudo)
  localStorage.setItem('cadastro', JSON.stringify({ nome, email, usuario, senha }));

  ['cadNome', 'cadEmail', 'cadUsuario', 'cadSenha'].forEach(id => $id(id).value = '');   // limpa os campos
  forca();                                                 // zera o medidor de senha
  aba('login');                                            // vai para a aba de login
  $id('loginUsuario').value = usuario;                     // já preenche o usuário
  mostrarMensagem('Cadastro realizado!', true);            // mensagem verde de sucesso
  $id('loginSenha').focus();                               // cursor na senha
}

// entrando evita clique duplo em "Entrar" durante a animação de boas-vindas
let entrando = false;

// entrar faz o login comparando com o cadastro salvo
function entrar() {
  if (entrando) return;                                    // já está entrando: ignora
  const usuario = $id('loginUsuario').value,               // o que foi digitado
    senha = $id('loginSenha').value,
    dados = lerCadastro();                                 // conta salva

  if (dados === null) return mostrarMensagem('Realize seu cadastro primeiro!', false);   // sem conta salva
  if (usuario !== dados.usuario || senha !== dados.senha)  // usuário ou senha não batem
    return mostrarMensagem('Usuário ou senha incorretos!', false);

  mostrarMensagem('Acesso permitido!', true);              // deu certo

  // "Manter conectado": guarda quem está logado; senão, apaga a sessão
  if ($id('manter').checked) localStorage.setItem('sessao', dados.usuario);
  else localStorage.removeItem('sessao');

  entrando = true;                                         // trava novos cliques
  $id('bvNome').textContent = 'Olá, ' + dados.nome.split(' ')[0] + '!';   // boas-vindas com o primeiro nome
  $id('boasvindas').hidden = false;                        // mostra a tela de boas-vindas

  setTimeout(() => {                                       // depois da animação...
    mostrarPlataforma(dados);                              // ...abre a plataforma
    entrando = false;                                      // ...e libera o botão
  }, reduz ? 200 : 1100);                                  // 0,2 s se prefere menos animação; senão 1,1 s
}

// mostrarPlataforma exibe o app e esconde a tela de acesso
function mostrarPlataforma(dados) {
  $id('ola').textContent = 'Olá, ' + dados.nome.split(' ')[0];   // saudação com o primeiro nome
  $id('plataforma').style.display = 'block';               // mostra o app
  $id('acesso').style.display = 'none';                    // esconde o login
  $id('boasvindas').hidden = true;                         // esconde as boas-vindas
  rolar();                                                 // rola a agenda até a hora atual
}

// logout volta para a tela de acesso
function logout() {
  localStorage.removeItem('sessao');                       // esquece a sessão
  $id('plataforma').style.display = 'none';                // esconde o app
  $id('acesso').style.display = '';                        // devolve o estilo padrão (mostra o login)
  $id('loginUsuario').value = '';                          // limpa os campos
  $id('loginSenha').value = '';
  $id('manter').checked = false;                           // desmarca "manter conectado"
  aba('login');                                            // abre a aba de login
}

// Aviso de Caps Lock no campo de senha
const campoSenha = $id('loginSenha');                      // campo de senha do login
['keydown', 'keyup'].forEach(tipo =>                       // a cada tecla pressionada ou solta...
  campoSenha.addEventListener(tipo, e =>
    // ...mostra o aviso se o Caps Lock estiver ligado
    $id('caps').hidden = !(e.getModifierState && e.getModifierState('CapsLock'))));
campoSenha.addEventListener('blur', () => $id('caps').hidden = true);   // ao sair do campo, esconde o aviso

// Setas esquerda/direita trocam de aba (só há duas, então vai para a outra)
$('.tabs').addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
    aba($id('abaLogin').getAttribute('aria-selected') === 'true' ? 'cadastro' : 'login');
});

// "Manter conectado": entra direto se a sessão for do usuário cadastrado
(() => {                                                   // função que executa sozinha ao carregar
  const dados = lerCadastro();                             // conta salva
  if (dados !== null && localStorage.getItem('sessao') === dados.usuario) mostrarPlataforma(dados);   // sessão válida: pula o login
  else $id('loginUsuario').focus();                        // senão, cursor no campo de usuário
})();