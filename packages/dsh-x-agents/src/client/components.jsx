import React, { useEffect, useRef, useState } from 'react'
import { CAPABILITIES, canPrepare, insertRequest, parseAddress, prepareRun, presentationEvents, readSnapshot } from './model.js'
import { errorKey } from './locales.js'

export function AgentsEntry({ useAgents, openAgents, t }) {
  const state = useAgents(state => state)
  const task = state.snapshot?.task
  return <button type="button" className="dxa-entry" onClick={openAgents} disabled={state.status === 'loading'} title={state.status === 'loading' ? t('loading') : state.status === 'live' ? t('open') : t('retry')}>
    <span aria-hidden="true" className="dxa-mark">A</span><span>{t('title')}</span>
    {state.status === 'live' && task && <span className="dxa-entry-state">{t(`state.${task.cancellationRequested ? 'stopping' : task.state}`)}</span>}
    {state.status === 'failed' && <span className="dxa-entry-state">{t('retry')}</span>}
  </button>
}

function Availability({ agent, t }) {
  const availability = agent.reason === 'not-integrated' ? 'not-integrated' : agent.available === true ? 'available' : agent.available === false ? 'unavailable' : 'unknown'
  return <span className="dxa-availability">{t(`availability.${availability}`)}{availability !== 'not-integrated' && <> · {t(agent.authenticated === true ? 'auth.yes' : agent.authenticated === false ? 'auth.no' : 'auth.unknown')}</>}</span>
}

function Connections({ catalog, t, prepareInspect, enabled }) {
  return <details className="dxa-details dxa-connections">
    <summary>{t('connections')}</summary>
    <p className="dxa-muted">{t('connectionHint')}</p>
    {catalog.map(agent => <section key={agent.id} className="dxa-connection" data-agent={agent.id}>
      <strong>{agent.label}</strong><Availability agent={agent} t={t} />
      <dl className="dxa-record"><dt>{t('transport')}</dt><dd>{agent.transport}</dd><dt>{t('version')}</dt><dd>{agent.version || t('unknownVersion')}</dd></dl>
      {agent.reason && agent.reason !== 'not-integrated' && <p className="dxa-raw">{agent.reason}</p>}
      {agent.providerAuthentication && <p className="dxa-muted">{t('providerAuth')}: {agent.providerAuthentication === 'unverified' ? t('providerUnverified') : agent.providerAuthentication}</p>}
      {Array.isArray(agent.limitations) && agent.limitations.length > 0 && <div className="dxa-limitations"><strong>{t('limitations')}</strong><ul>{agent.limitations.filter(item => typeof item === 'string').map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
      {agent.sandbox != null && <details><summary>{t('sandbox')}</summary><pre className="dxa-raw">{typeof agent.sandbox === 'string' ? agent.sandbox : JSON.stringify(agent.sandbox, null, 2)}</pre></details>}
      {Array.isArray(agent.capabilities.permissionScopes) && <p className="dxa-muted">{t('permissionScopes')}: {agent.capabilities.permissionScopes.filter(item => typeof item === 'string').join(', ')}</p>}
      <p className="dxa-muted">{t('capabilities')}</p>
      <div className="dxa-capabilities">{CAPABILITIES.filter(key => agent.capabilities[key] === true).map(key => <span key={key}>{t(`cap.${key}`)}</span>)}</div>
    </section>)}
    <button type="button" onClick={prepareInspect} disabled={!enabled}>{t('inspect')}</button><p className="dxa-muted">{t('inspectHint')}</p>
  </details>
}

function Events({ events, t }) {
  const [all, setAll] = useState(false)
  const rows = presentationEvents(events), visible = all ? rows : rows.slice(-20)
  return <section className="dxa-events"><h3>{t('events')}</h3>
    {events.length === 0 ? <p className="dxa-muted">{t('noEvents')}</p> : <>
      {rows.length > 20 && !all && <button type="button" onClick={() => setAll(true)}>{t('allEvents')} ({rows.length})</button>}
      <ol>{visible.map(event => <li key={event.key} data-event={event.type}>
        <span className="dxa-event-label">{t(`event.${event.type}`)}</span>
        {event.text && <pre className="dxa-raw">{event.text}</pre>}
      </li>)}</ol>
    </>}
  </section>
}

function Workspace({ state, sessionId, inputActions, cancel, refresh, t, formatTime }) {
  const snapshot = state.snapshot, task = snapshot.task
  const defaultContinue = task?.allowedActions.includes('request-continue') ?? false
  const [continueTask, setContinueTask] = useState(defaultContinue)
  const [choice, setChoice] = useState(snapshot.catalog.find(canPrepare)?.id ?? '')
  const [chosenModel, setModel] = useState('')
  const [goal, setGoal] = useState('')
  const [notice, setNotice] = useState(null)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])
  const runtime = continueTask && task ? task.runtime : choice
  const model = continueTask && task ? task.model ?? '' : chosenModel
  const agent = snapshot.catalog.find(item => item.id === runtime)
  const live = state.status === 'live' && !state.pending
  const canStart = live && (!task || task.allowedActions.includes('request-start'))
  const canContinue = live && Boolean(task?.allowedActions.includes('request-continue'))
  const models = agent?.capabilities.models === true ? agent.models : []
  const modelValid = !model || models.some(item => item.id === model)
  const canInsert = (continueTask ? canContinue : canStart) && canPrepare(agent) && modelValid
  const needsSetup = !snapshot.catalog.some(canPrepare)
  const hasRequestAction = !task || task.allowedActions.some(action => ['request-start', 'request-continue'].includes(action))
  const put = text => {
    try {
      const inserted = insertRequest(inputActions, text)
      setNotice({ key: inserted ? 'inserted' : 'draftChanged', error: !inserted })
    } catch { setNotice({ key: 'insertionUnconfirmed', error: true }) }
  }
  const prepare = () => {
    try {
      const args = prepareRun(snapshot, { runtime, model, prompt: goal, continueTask })
      put(`${t('request')}\n${JSON.stringify(args, null, 2)}`)
    } catch (error) { setNotice({ key: errorKey(error.message), error: true }) }
  }
  const stop = async () => {
    const result = await cancel({ scope: snapshot.scope, taskId: task.id, runId: task.runId })
    if (alive.current && !result.ok) setNotice({ key: errorKey(result.error?.code), error: true })
  }
  return <section className="dxa-workspace" aria-label={t('title')} data-agents-session={sessionId} data-state={task?.state ?? 'none'}>
    <header className="dxa-header"><div><h2>{t('title')}</h2><p className="dxa-muted">{t('host')}</p></div><button type="button" onClick={refresh} disabled={state.pending}>{t('retry')}</button></header>
    {state.status !== 'live' && <p className="dxa-notice dxa-warning" role="alert">{t('stale')}</p>}
    {state.error && <p className="dxa-notice dxa-warning" role="alert">{t(errorKey(state.error.code))}<span className="dxa-muted"> {state.error.code}</span></p>}
    {task ? <section className="dxa-current">
      <div className="dxa-task-heading"><h3>{task.title || t('task')}</h3><span className={`dxa-status dxa-state-${task.state}`} role="status">{t(`state.${task.cancellationRequested ? 'stopping' : task.state}`)}</span></div>
      <p className="dxa-task-agent">{snapshot.catalog.find(item => item.id === task.runtime)?.label ?? task.runtime}{task.model ? ` · ${task.model}` : ''}</p>
      <p className="dxa-next">{t(task.cancellationRequested ? 'stopping' : task.state)}</p>
      {task.summary && <section><h3>{t('summary')}</h3><pre className="dxa-raw dxa-summary">{task.summary}</pre></section>}
      {task.reason && <p className="dxa-raw dxa-warning">{task.reason}</p>}
      {task.allowedActions.includes('cancel') && task.runId && <div className="dxa-stop"><button type="button" disabled={!live} onClick={stop}>{t(state.pending ? 'cancelling' : 'cancel')}</button><span className="dxa-muted">{t('stopHint')}</span></div>}
    </section> : <p className="dxa-empty">{t('first')}</p>}
    {hasRequestAction && <section className="dxa-prepare"><h3>{t('delegation')}</h3>
      {needsSetup && <div className="dxa-notice"><p>{t('setupFirst')}</p><button type="button" className="dxa-primary" disabled={!live} onClick={() => put(t('inspectRequest'))}>{t('inspect')}</button></div>}
      {task && <div className="dxa-modes">
        {task.allowedActions.includes('request-continue') && <button type="button" aria-pressed={continueTask} onClick={() => { setContinueTask(true); setModel(''); setNotice(null) }}>{t('nextTurn')}</button>}
        {task.allowedActions.includes('request-start') && <button type="button" aria-pressed={!continueTask} onClick={() => { setContinueTask(false); setModel(''); setNotice(null) }}>{t('newTask')}</button>}
      </div>}
      <div className="dxa-selectors"><label>{t('agent')}<select value={runtime} onChange={event => { setChoice(event.target.value); setModel(''); setNotice(null) }} disabled={!live || continueTask}>
        {!runtime && <option value="">{t('chooseAgent')}</option>}
        {snapshot.catalog.map(item => <option key={item.id} value={item.id} disabled={!canPrepare(item)}>{item.label}{item.reason === 'not-integrated' ? ` · ${t('availability.not-integrated')}` : item.available === false ? ` · ${t('availability.unavailable')}` : ''}</option>)}
      </select></label>
      <label>{t('model')}<select value={model} disabled={!live || continueTask || (models.length === 0 && !model)} onChange={event => setModel(event.target.value)}><option value="">{t('nativeDefault')}</option>{!modelValid && <option value={model} disabled>{model} · {t('availability.unavailable')}</option>}{models.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></div>
      {!modelValid && <p className="dxa-warning" role="alert">{t('error.model-unavailable')}</p>}
      {agent && <Availability agent={agent} t={t} />}
      {agent?.providerAuthentication && <p className="dxa-muted">{t('providerAuth')}: {agent.providerAuthentication === 'unverified' ? t('providerUnverified') : agent.providerAuthentication}</p>}
      {Array.isArray(agent?.limitations) && agent.limitations.length > 0 && <ul className="dxa-limitations">{agent.limitations.filter(item => typeof item === 'string').slice(0, 2).map((item, index) => <li key={index}>{item}</li>)}</ul>}
      {agent && (agent.available !== true || agent.authenticated !== true) && canPrepare(agent) && <p className="dxa-notice">{t('unknownBeforeRun')}</p>}
      {!agent && <p className="dxa-muted">{t(needsSetup ? 'noRuntime' : 'chooseAgent')}</p>}
      {agent && models.length === 0 && <p className="dxa-muted">{t('noModel')}</p>}
      {task && <p className="dxa-muted">{t(continueTask ? 'continueHint' : 'newHint')}</p>}
      {!needsSetup && <><label className="dxa-goal">{t('goal')}<textarea value={goal} onChange={event => { setGoal(event.target.value); setNotice(null) }} placeholder={t('goalPlaceholder')} rows={3} maxLength={12000} disabled={!live} /></label>
      <button type="button" className="dxa-primary" disabled={!canInsert || !goal.trim()} onClick={prepare}>{t('insert')}</button></>}
      <p className="dxa-muted">{t('hostHint')}</p>
    </section>}
    {notice && <p className={`dxa-notice ${notice.error ? 'dxa-warning' : ''}`} role={notice.error ? 'alert' : 'status'}>{t(notice.key)}</p>}
    {task && <><Events key={task.id} events={task.events} t={t} /><details className="dxa-details"><summary>{t('technical')}</summary><dl className="dxa-record">
      {[['taskId', task.id], ['revision', task.revision], ['nativeSession', task.nativeSessionId || t('noSession')], ['cwd', task.cwd || t('noSession')], ['updated', formatTime(task.updatedAt)]].map(([label, value]) => <React.Fragment key={label}><dt>{t(label)}</dt><dd>{value}</dd></React.Fragment>)}
    </dl></details></>}
    <Connections catalog={snapshot.catalog} t={t} enabled={live} prepareInspect={() => put(t('inspectRequest'))} />
  </section>
}

export function AgentsPanel({ sessionId, useTabInfo, useResource, inputActions, cancel, refresh, t, formatTime }) {
  const tab = useTabInfo(), address = tab.tab.navigation.address
  const target = parseAddress(address), resource = useResource(address)
  const state = resource.value
  if (!target || target.sessionId !== sessionId) return <p className="dxa-message" role="alert">{t('invalidAddress')}</p>
  if (!state?.snapshot || state.snapshot.scope !== target.scope || state.snapshot.sessionId !== sessionId) {
    const key = state?.status === 'scope-changed' || state?.snapshot && state.snapshot.scope !== target.scope ? 'scopeChanged' : state?.status === 'failed' || resource.status === 'failed' ? 'unavailable' : 'loading'
    return <div className="dxa-message" role="status"><p>{t(key)}</p><button type="button" onClick={refresh}>{t('retry')}</button></div>
  }
  return <Workspace key={`${target.scope}/${sessionId}`} state={state} sessionId={sessionId} inputActions={inputActions} cancel={cancel} refresh={refresh} t={t} formatTime={formatTime} />
}

export function AgentsToolRow({ phase, block, inspect, openCurrent, t }) {
  const meta = block?.meta
  const snapshot = !block?.isError && meta?.kind === 'dsh-x-agents.result' && meta.version === 1 ? readSnapshot(meta, meta.sessionId) : null
  const task = snapshot?.task
  return <section className="dxa-tool" aria-label={t('title')}>
    <div className="dxa-task-heading"><strong>{t('title')}</strong><span className="dxa-status" role="status">{phase !== 'result' ? t('operationRunning') : block?.isError ? t('operationFailed') : task ? t(`state.${task.cancellationRequested ? 'stopping' : task.state}`) : t('historyResult')}</span></div>
    {phase === 'result' && <>
      {snapshot ? <><p className="dxa-muted">{t('historyResult')} · {t('host')}</p>{task && <p>{task.title}</p>}{task?.summary && <pre className="dxa-raw">{task.summary.slice(0, 1400)}{task.summary.length > 1400 ? '…' : ''}</pre>}{task && <p className="dxa-muted">{t(task.state)}</p>}</> : <p>{t('unsupportedResult')}</p>}
      <div className="dxa-stop">{snapshot && openCurrent && <button type="button" onClick={() => openCurrent(snapshot)}>{t('openCurrent')}</button>}{inspect && <button type="button" onClick={inspect}>{t('inspectRecord')}</button>}</div>
    </>}
  </section>
}
