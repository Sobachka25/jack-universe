import { useEffect, useState } from 'react'
import { toString as qrSvg } from 'qrcode'
import { phoneJoinUrl } from '../phoneJoin'

export function JoinQr({ code }: { code: string }) {
  const [url, setUrl] = useState('')
  const [svg, setSvg] = useState('')

  useEffect(() => {
    let cancelled = false
    void phoneJoinUrl(code)
      .then(async (next) => {
        const markup = await qrSvg(next, {
          type: 'svg',
          margin: 1,
          errorCorrectionLevel: 'M',
          color: { dark: '#14110f', light: '#f6f1ea' },
        })
        if (!cancelled) {
          setUrl(next)
          setSvg(markup)
        }
      })
      .catch(() => {
        if (!cancelled) setSvg('')
      })
    return () => {
      cancelled = true
    }
  }, [code])

  const local = url.includes('localhost') || url.includes('127.0.0.1')

  return (
    <div className="join-qr-wrap">
      <div
        className="join-qr"
        data-join={url}
        aria-label={url ? `QR для входа: ${url}` : 'QR для входа'}
        dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
      />
      {local ? (
        <p className="hint">Телефон не откроет localhost. Зайди на сайт по сетевому адресу.</p>
      ) : null}
    </div>
  )
}
