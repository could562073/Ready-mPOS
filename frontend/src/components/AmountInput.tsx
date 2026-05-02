interface AmountInputProps {
  label: string
  value: number
  onChange: (value: number) => void
}

export function AmountInput({ label, value, onChange }: AmountInputProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
      <label className="text-sm text-gray-600 select-none">{label}</label>
      <div className="flex items-center gap-1">
        <span className="text-gray-400 text-sm">$</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={value === 0 ? '' : value}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10)
            onChange(isNaN(v) || v < 0 ? 0 : v)
          }}
          onBlur={(e) => {
            if (e.target.value === '') onChange(0)
          }}
          className="w-28 text-right border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="0"
        />
      </div>
    </div>
  )
}
