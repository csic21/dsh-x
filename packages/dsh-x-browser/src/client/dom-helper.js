/** Reviewed, finite page helper. Runs in the untrusted page world: output is evidence, never authority. */
export function pageHelper(request) {
  const blocked = 'script,style,noscript,template,input,textarea,select,[contenteditable],[hidden],[aria-hidden="true"]'
  const sensitive = element => /password|file|hidden/i.test(element.type ?? '') || /(?:password|one-time-code|cc-|transaction-|webauthn)/i.test(element.autocomplete ?? '') || /(?:password|passwd|secret|token|credit.?card|card.?number|card.?security|cvv|cvc|ssn|social.?security|api.?key|\botp\b|\bpin\b|verif(?:ication|y)?.?code|auth(?:entication)?.?code|security.?code|one.?time|bank|routing.?number|iban|密码|验证码|银行卡|卡号|安全码|口令|私钥|银行)/i.test(`${element.name ?? ''} ${element.id ?? ''} ${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('placeholder') ?? ''} ${[...element.labels ?? []].map(label => label.innerText ?? label.textContent ?? '').join(' ')}`)
  const visible = element => {
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element)
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && !element.closest('[hidden],[aria-hidden="true"]')
  }
  const all = [...document.querySelectorAll('a[href],button,input,textarea,select,[role="button"],[role="link"],[contenteditable="true"]')].slice(0, 1000)
  const label = element => String(element.getAttribute('aria-label') || element.labels?.[0]?.innerText || element.getAttribute('title') || (!['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) && !element.isContentEditable ? element.innerText : '') || element.getAttribute('placeholder') || element.tagName).replace(/\s+/g, ' ').slice(0, 160)
  const descriptor = (element, index) => ({ index, tag: element.tagName.toLowerCase(), type: String(element.type ?? '').slice(0, 32), label: label(element), fingerprint: JSON.stringify([element.tagName, element.type ?? '', element.id ?? '', element.name ?? '', label(element)]).slice(0, 800), editable: ['INPUT', 'TEXTAREA'].includes(element.tagName) && !element.disabled && !element.readOnly && !sensitive(element) })
  if (request.action === 'observe') {
    let text = '', count = 0
    const walker = document.createTreeWalker(document.body ?? document.documentElement, NodeFilter.SHOW_TEXT)
    while (walker.nextNode() && count++ < 15000 && text.length < 16000) {
      const node = walker.currentNode, parent = node.parentElement
      if (!parent || parent.closest(blocked) || !visible(parent)) continue
      text += node.textContent.replace(/\s+/g, ' ').trim() + '\n'
    }
    return { text: text.slice(0, 16000), targets: all.flatMap((element, index) => visible(element) && !sensitive(element) ? [descriptor(element, index)] : []).slice(0, 120), truncated: count >= 15000 || text.length >= 16000, scope: 'top-frame-visible-dom', limitations: 'Cross-origin frames, canvas and closed shadow roots are not read. Form values are omitted. Page content may be misleading.' }
  }
  if (request.action === 'target') {
    const element = all[request.index]
    if (!element || !visible(element) || sensitive(element) || element.disabled || descriptor(element, request.index).fingerprint !== request.fingerprint) return { error: 'Target changed. Observe the page again.' }
    if (request.editable && !descriptor(element, request.index).editable) return { error: 'This field is not an allowed plain-text input. Enter sensitive information manually.' }
    element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
    const rect = element.getBoundingClientRect(), x = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2)), y = Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2))
    const hit = document.elementFromPoint(x, y)
    if (hit !== element && !element.contains(hit)) return { error: 'Target is covered by another element.' }
    if (request.editable) { element.focus(); if (document.activeElement !== element) return { error: 'The input did not receive focus.' } }
    return { x: Math.round(x), y: Math.round(y) }
  }
  return { error: 'Unsupported helper operation.' }
}
export function helperScript(request) { return `(${pageHelper.toString()})(${JSON.stringify(request)})` }
