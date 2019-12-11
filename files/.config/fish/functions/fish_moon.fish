function fish_moon -d 'Describe the current phase of the moon'
  # Time now (unix time)
  if test (uname) = "Linux"
    if test (count $argv) -gt 0
      set now (date -d $argv[1] +"%s")
    else
      set now (date -u +"%s")
    end
  else
    if test (count $argv) -gt 0
      set now (date -j -f "%F" $argv[1] +"%s")
    else
      set now (date -j -u +"%s")
    end
  end
  # Lunar period in seconds (29.53 days)
  set lp 2551442.8015584
  # Known new moon time in seconds (1970-01-07T20:35)
  set newmoon 592500
  # Last new moon
  set newmoon (math -s0 "$now - (($now - $newmoon) % $lp)")
  # Timestamp of each phase since last new moon
  set date_NM (math "round(($newmoon + $lp * 0.00) / 86400) * 86400")
  set date_FQ (math "round(($newmoon + $lp * 0.24) / 86400) * 86400")
  set date_FM (math "round(($newmoon + $lp * 0.49) / 86400) * 86400")
  set date_TQ (math "round(($newmoon + $lp * 0.74) / 86400) * 86400")
  set date_DM (math "round(($newmoon + $lp * 0.99) / 86400) * 86400")
  # Today's timestamp
  set date (math "round($now / 86400) * 86400")
  if test $date = $date_NM
    echo "new"
  else if test $date -lt $date_FQ
    echo "waxing crescent"
  else if test $date = $date_FQ
    echo "first quarter"
  else if test $date -lt $date_FM
    echo "waxing gibbous"
  else if test $date = $date_FM
    echo "full"
  else if test $date -lt $date_TQ
    echo "waning gibbous"
  else if test $date = $date_TQ
    echo "third quarter"
  else if test $date -lt $date_DM
    echo "waning crescent"
  else
    echo "new"
  end
end

