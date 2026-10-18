import React, { useEffect, useRef, useState } from 'react'
import { CAPABILITIES, canPrepare, eventDataPreview, insertRequest, parseAddress, prepareModels, prepareRun, presentationEvents, readSnapshot } from './model.ts'
import { errorKey } from './locales.ts'

export function AgentsEntry({ useAgents, openAgents, t }: any) {
  const state = useAgents((state: any) => state)
  const task = state.snapshot?.task, operation = state.snapshot?.operation
  return <button type="button" className="dxa-entry" onClick={openAgents} disabled={state.status === 'loading'} title={state.status === 'loading' ? t('loading') : state.status === 'live' ? t('open') : t('retry')}>
    <span aria-hidden="true" className="dxa-mark">A</span><span>{t('title')}</span>
    {state.status === 'live' && (operation || task) && <span className="dxa-entry-state">{operation ? t(`modelsOperation.${operation.state}`) : t(`state.${task.cancellationRequested ? 'stopping' : task.state}`)}</span>}
    {state.status === 'failed' && <span className="dxa-entry-state">{t('retry')}</span>}
  </button>
}

function Availability({ agent, t }: any) {
  const availability = agent.reason === 'not-integrated' ? 'not-integrated' : agent.available === true ? 'available' : agent.available === false ? 'unavailable' : 'unknown'
  return <span className="dxa-availability">{t(`availability.${availability}`)}{availability !== 'not-integrated' && <> · {t(agent.authenticated === true ? 'auth.yes' : agent.authenticated === false ? 'auth.no' : 'auth.unknown')}</>}</span>
}

function ModelCatalog({ agent, t, formatTime, action }: any) {
  const catalog = agent.modelCatalog
  const status = catalog ? `modelCatalog.${catalog.status}` : agent.models.length ? 'modelsUntimed' : 'modelCatalog.not-loaded'
  return <div className="dxa-model-catalog" data-catalog-state={catalog?.status ?? 'legacy'}>
    <div className="dxa-catalog-heading"><p className={['stale', 'failed'].includes(catalog?.status) ? 'dxa-warning' : 'dxa-muted'} role="status">{t(status)}{(catalog?.fetchedAt || agent.models.length > 0) && <> · {t('modelsCount', { count: agent.models.length })}</>}</p>{action}</div>
    {catalog?.truncated && <p className="dxa-warning">{t('modelsPartial')}</p>}
    {catalog?.status === 'fresh' && agent.models.length === 0 && <p className="dxa-muted">{t('modelsEmpty')}</p>}
    {catalog?.error && <p className="dxa-raw dxa-warning">{catalog.error}</p>}
    <p className="dxa-muted">{t('modelsNotVerified')}</p>
    {catalog && <details><summary>{t('modelsDetails')}</summary><dl className="dxa-record">
      <dt>{t('modelsFetched')}</dt><dd>{catalog.fetchedAt ? formatTime(catalog.fetchedAt) : t('noSession')}</dd>
      <dt>{t('modelsExpires')}</dt><dd>{catalog.expiresAt ? formatTime(catalog.expiresAt) : t('noSession')}</dd>
      <dt>{t('modelsSource')}</dt><dd>{catalog.source || t('noSession')}</dd>
    </dl></details>}
  </div>
}

function Connections({ catalog, t, prepareInspect, enabled }: any) {
  return <details className="dxa-details dxa-connections">
    <summary>{t('connections')}</summary>
    <p className="dxa-muted">{t('connectionHint')}</p>
    {catalog.map((agent: any) => <section key={agent.id} className="dxa-connection" data-agent={agent.id}>
      <strong>{agent.label}</strong><Availability agent={agent} t={t} />
      <dl className="dxa-record"><dt>{t('transport')}</dt><dd>{agent.transport}</dd><dt>{t('version')}</dt><dd>{agent.version || t('unknownVersion')}</dd></dl>
      {agent.reason && agent.reason !== 'not-integrated' && <p className="dxa-raw">{agent.reason}</p>}
      {agent.providerAuthentication && <p className="dxa-muted">{t('providerAuth')}: {agent.providerAuthentication === 'unverified' ? t('providerUnverified') : agent.providerAuthentication}</p>}
      {Array.isArray(agent.limitations) && agent.limitations.length > 0 && <div className="dxa-limitations"><strong>{t('limitations')}</strong><ul>{agent.limitations.filter((item: any) => typeof item === 'string').map((item: any, index: any) => <li key={index}>{item}</li>)}</ul></div>}
      {agent.sandbox != null && <details><summary>{t('sandbox')}</summary><pre className="dxa-raw">{typeof agent.sandbox === 'string' ? agent.sandbox : JSON.stringify(agent.sandbox, null, 2)}</pre></details>}
      {Array.isArray(agent.capabilities.permissionScopes) && <p className="dxa-muted">{t('permissionScopes')}: {agent.capabilities.permissionScopes.filter((item: any) => typeof item === 'string').join(', ')}</p>}
      <p className="dxa-muted">{t('capabilities')}</p>
      <div className="dxa-capabilities">{CAPABILITIES.filter(key => agent.capabilities[key] === true).map(key => <span key={key}>{t(`cap.${key}`)}</span>)}</div>
    </section>)}
    <button type="button" onClick={prepareInspect} disabled={!enabled}>{t('inspect')}</button><p className="dxa-muted">{t('inspectHint')}</p>
  </details>
}

function Events({ events, t }: any) {
  const [all, setAll] = useState(false)
  const rows = presentationEvents(events), visible = all ? rows : rows.slice(-20)
  return <section className="dxa-events"><h3>{t('events')}</h3>
    {events.length === 0 ? <p className="dxa-muted">{t('noEvents')}</p> : <>
      {rows.length > 20 && !all && <button type="button" onClick={() => setAll(true)}>{t('allEvents')} ({rows.length})</button>}
      <ol>{visible.map(event => {
        const data = eventDataPreview(event)
        return <li key={event.key} data-event={event.type}>
          <span className="dxa-event-label">{t(`event.${event.type}`)}</span>
          {event.text && <pre className="dxa-raw">{event.text}</pre>}
          {data && <details className="dxa-event-data"><summary>{t('eventData')}</summary>
            <p className="dxa-muted">{t('eventDataHint')}</p><pre className="dxa-raw">{data.body}</pre>
            {data.truncated && <p className="dxa-muted">{t('eventDataTruncated')}</p>}
          </details>}
        </li>
      })}</ol>
    </>}
  </section>
}

function Workspace({ state, sessionId, inputActions, cancel, refresh, t, formatTime }: any) {
  const snapshot = state.snapshot, task = snapshot.task, operation = snapshot.operation
  const defaultContinue = task?.allowedActions.includes('request-continue') ?? false
  const [continueTask, setContinueTask] = useState(defaultContinue)
  const [choice, setChoice] = useState(snapshot.catalog.find(canPrepare)?.id ?? '')
  const [chosenModel, setModel] = useState('')
  const [goal, setGoal] = useState('')
  const [notice, setNotice] = useState<any>(null)
  // A preparation receipt is no longer current once the native task advances.
  // This does not infer that Send was used, or change either editor's draft.
  useEffect(() => { setNotice((current: any) => current?.key === 'inserted' ? null : current) }, [task?.id, task?.runId, task?.state, operation?.runtime, operation?.state])
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])
  const runtime = continueTask && task ? task.runtime : choice
  const model = continueTask && task ? task.model ?? '' : chosenModel
  const agent = snapshot.catalog.find((item: any) => item.id === runtime)
  const live = state.status === 'live' && !state.pending
  const canStart = live && !operation && (!task || task.allowedActions.includes('request-start'))
  const canContinue = live && !operation && Boolean(task?.allowedActions.includes('request-continue'))
  const models = agent?.capabilities.models === true ? agent.models : []
  const modelValid = !model || models.some((item: any) => item.id === model)
  const canInsert = (continueTask ? canContinue : canStart) && canPrepare(agent) && modelValid
  const needsSetup = !snapshot.catalog.some(canPrepare)
  const hasRequestAction = !task || task.allowedActions.some((action: any) => ['request-start', 'request-continue'].includes(action))
  const canGetModels = live && !operation && canPrepare(agent) && hasRequestAction
  const put = (text: any) => {
    try {
      const inserted = insertRequest(inputActions, text)
      setNotice({ key: inserted ? 'inserted' : 'draftChanged', error: !inserted })
    } catch { setNotice({ key: 'insertionUnconfirmed', error: true }) }
  }
  const prepare = () => {
    try {
      const args = prepareRun(snapshot, { runtime, model, prompt: goal, continueTask })
      put(`${t('request')}\n${JSON.stringify(args, null, 2)}`)
    } catch (error: any) { setNotice({ key: errorKey(error.message), error: true }) }
  }
  const getModels = () => {
    try { put(`${t('modelsRequest')}\n${JSON.stringify(prepareModels(snapshot, runtime), null, 2)}`) }
    catch (error: any) { setNotice({ key: errorKey(error.message), error: true }) }
  }
  const stop = async () => {
    const result = await cancel({ scope: snapshot.scope, taskId: task.id, runId: task.runId })
    if (alive.current && !result.ok) setNotice({ key: errorKey(result.error?.code), error: true })
  }
  return <section className="dxa-workspace" aria-label={t('title')} data-agents-session={sessionId} data-state={task?.state ?? 'none'}>
    <header className="dxa-header"><div><h2>{t('title')}</h2><p className="dxa-muted">{t('host')}</p></div><button type="button" onClick={refresh} disabled={state.pending} title={t('snapshotRefreshHint')}>{t('snapshotRefresh')}</button></header>
    {state.status !== 'live' && <p className="dxa-notice dxa-warning" role="alert">{t('stale')}</p>}
    {state.error && <p className="dxa-notice dxa-warning" role="alert">{t(errorKey(state.error.code))}<span className="dxa-muted"> {state.error.code}</span></p>}
    {operation && <section className={`dxa-notice dxa-model-operation${operation.state === 'blocked' ? ' dxa-warning' : ''}`} role="status"><strong>{snapshot.catalog.find((item: any) => item.id === operation.runtime)?.label ?? operation.runtime} · {t(`modelsOperation.${operation.state}`)}</strong><p>{t(operation.state === 'waiting_permission' ? 'modelsApprovalHint' : operation.state === 'blocked' ? 'modelsBlockedHint' : 'modelsDiscoveringHint')}</p>{operation.reason && <p className="dxa-raw">{operation.reason}</p>}</section>}
    {task ? <section className="dxa-current">
      <div className="dxa-task-heading"><h3>{task.title || t('task')}</h3><span className={`dxa-status dxa-state-${task.state}`} role="status">{t(`state.${task.cancellationRequested ? 'stopping' : task.state}`)}</span></div>
      <p className="dxa-task-agent">{snapshot.catalog.find((item: any) => item.id === task.runtime)?.label ?? task.runtime}{task.model ? ` · ${task.model}` : ''}</p>
      <p className="dxa-next">{t(task.cancellationRequested ? 'stopping' : task.state)}</p>
      {task.summary && <section><h3>{t('summary')}</h3><pre className="dxa-raw dxa-summary">{task.summary}</pre></section>}
      {task.reason && <p className="dxa-raw dxa-warning">{task.reason}</p>}
      {task.allowedActions.includes('cancel') && task.runId && <div className="dxa-stop"><button type="button" disabled={!live} onClick={stop}>{t(state.pending ? 'cancelling' : 'cancel')}</button><span className="dxa-muted">{t('stopHint')}</span></div>}
    </section> : <p className="dxa-empty">{t('first')}</p>}
    {hasRequestAction && <section className="dxa-prepare"><h3>{t('delegation')}</h3>
      {needsSetup && <div className="dxa-notice"><p>{t('setupFirst')}</p><button type="button" className="dxa-primary" disabled={!live || Boolean(operation)} onClick={() => put(t('inspectRequest'))}>{t('inspect')}</button></div>}
      {task && <div className="dxa-modes">
        {task.allowedActions.includes('request-continue') && <button type="button" aria-pressed={continueTask} onClick={() => { setContinueTask(true); setModel(''); setNotice(null) }}>{t('nextTurn')}</button>}
        {task.allowedActions.includes('request-start') && <button type="button" aria-pressed={!continueTask} onClick={() => { setContinueTask(false); setModel(''); setNotice(null) }}>{t('newTask')}</button>}
      </div>}
      <div className="dxa-selectors"><label>{t('agent')}<select value={runtime} onChange={event => { setChoice(event.target.value); setModel(''); setNotice(null) }} disabled={!live || continueTask}>
        {!runtime && <option value="">{t('chooseAgent')}</option>}
        {snapshot.catalog.map((item: any) => <option key={item.id} value={item.id} disabled={!canPrepare(item)}>{item.label}{item.reason === 'not-integrated' ? ` · ${t('availability.not-integrated')}` : item.available === false ? ` · ${t('availability.unavailable')}` : ''}</option>)}
      </select></label>
      <label>{t('model')}<select value={model} disabled={!live || continueTask || (models.length === 0 && !model)} onChange={event => setModel(event.target.value)}><option value="">{t('nativeDefault')}</option>{!modelValid && <option value={model} disabled>{model} · {t('availability.unavailable')}</option>}{models.map((item: any) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      </div>
      {agent && <ModelCatalog agent={agent} t={t} formatTime={formatTime} action={<button type="button" className="dxa-model-request" onClick={getModels} disabled={!canGetModels} title={t('modelsRequestHint')}>{t(agent?.modelCatalog?.fetchedAt || models.length ? 'modelsUpdate' : 'modelsGet')}</button>} />}
      <p className="dxa-muted">{t('modelsRequestHint')}</p>
      {!modelValid && <p className="dxa-warning" role="alert">{t('error.model-unavailable')}</p>}
      {agent && <Availability agent={agent} t={t} />}
      {agent?.providerAuthentication && <p className="dxa-muted">{t('providerAuth')}: {agent.providerAuthentication === 'unverified' ? t('providerUnverified') : agent.providerAuthentication}</p>}
      {Array.isArray(agent?.limitations) && agent.limitations.length > 0 && <details className="dxa-runtime-details"><summary>{t('limitations')}</summary><ul className="dxa-limitations">{agent.limitations.filter((item: any) => typeof item === 'string').map((item: any, index: any) => <li key={index}>{item}</li>)}</ul></details>}
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
    <Connections catalog={snapshot.catalog} t={t} enabled={live && !operation} prepareInspect={() => put(t('inspectRequest'))} />
  </section>
}

export function AgentsPanel({ sessionId, useTabInfo, useResource, inputActions, cancel, refresh, t, formatTime }: any) {
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

export function AgentsToolRow({ phase, block, inspect, openCurrent, operationKind, t, formatTime = (value: any) => value || '—' }: any) {
  const meta = block?.meta
  const snapshot = !block?.isError && meta?.kind === 'dsh-x-agents.result' && meta.version === 1 ? readSnapshot(meta, meta.sessionId) : null
  const task = snapshot?.task
  const modelsOperation = operationKind === 'models'
  const modelAgent = modelsOperation ? snapshot?.catalog.find((agent: any) => agent.id === meta?.modelRuntime) : null
  return <section className="dxa-tool" aria-label={t('title')}>
    <div className="dxa-task-heading"><strong>{t(modelsOperation ? 'modelCatalogTitle' : 'title')}</strong><span className="dxa-status" role="status">{phase !== 'result' ? t(modelsOperation ? 'modelsOperationRunning' : 'operationRunning') : block?.isError ? t('operationFailed') : modelsOperation ? t(modelAgent?.modelCatalog ? `modelCatalog.${modelAgent.modelCatalog.status}` : 'historyResult') : task ? t(`state.${task.cancellationRequested ? 'stopping' : task.state}`) : t('historyResult')}</span></div>
    {phase === 'result' && <>
      {snapshot ? <><p className="dxa-muted">{t('historyResult')}{!modelsOperation && <> · {t('host')}</>}</p>{modelsOperation ? modelAgent ? <><strong>{modelAgent.label}</strong><ModelCatalog agent={modelAgent} t={t} formatTime={formatTime} /></> : <p>{t('unsupportedResult')}</p> : <>{task && <p>{task.title}</p>}{task?.summary && <pre className="dxa-raw">{task.summary.slice(0, 1400)}{task.summary.length > 1400 ? '…' : ''}</pre>}{task && <p className="dxa-muted">{t(task.state)}</p>}</>}</> : <p>{t('unsupportedResult')}</p>}
      <div className="dxa-stop">{snapshot && openCurrent && <button type="button" onClick={() => openCurrent(snapshot)}>{t('openCurrent')}</button>}{inspect && <button type="button" onClick={inspect}>{t('inspectRecord')}</button>}</div>
    </>}
  </section>
}
