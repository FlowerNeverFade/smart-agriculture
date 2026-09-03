# BearPi E53_IA1 remote actuator firmware

This source replaces the stock `C2_e53_ia1_temp_humi_pls` sample while
preserving its temperature, humidity and light output. It adds a narrow UART0
control protocol for the E53_IA1 motor (fan) and light outputs.

Accepted commands:

```text
AT+AGRI=<commandId>,FAN,ON,<1..3600 seconds>
AT+AGRI=<commandId>,FAN,OFF,0
AT+AGRI=<commandId>,LIGHT,ON,<1..3600 seconds>
AT+AGRI=<commandId>,LIGHT,OFF,0
```

The command is registered with the Hi3861 AT console so it does not compete
with another UART reader. The board returns a hardware acknowledgement only
after applying the GPIO state:

```text
AGRI_ACK <commandId> FAN ON SUCCEEDED APPLIED
AGRI_ACK <commandId> LIGHT OFF FAILED INVALID_COMMAND
AGRI_STATE FAN ON LIGHT OFF REASON COMMAND
```

Outputs default to OFF after boot. ON commands always have a bounded duration;
the firmware switches the output off and publishes a state line when the
deadline is reached. The eight most recent command IDs are retained for
idempotent retries. A successful boot prints
`AGRI_BOOT READY REMOTE_ACTUATORS_V2`.

`deploy-source.ps1` copies this tracked source into the existing BearPi SDK
sample tree before running the normal SDK build.
