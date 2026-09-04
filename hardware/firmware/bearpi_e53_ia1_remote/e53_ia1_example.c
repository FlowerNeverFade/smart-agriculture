/*
 * AgriLoop remote-control firmware for BearPi HM Nano + E53_IA1.
 * The E53_IA1 driver remains the upstream BearPi sample driver.
 */

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#include "ohos_init.h"
#include "cmsis_os2.h"
#include "hi_at.h"
#include "hi_errno.h"
#include "E53_IA1.h"

#define SENSOR_TASK_STACK_SIZE (1024 * 8)
#define SENSOR_TASK_PRIO 25
#define COMMAND_ID_MAX 96
#define COMMAND_CACHE_SIZE 8
#define MAX_RUN_SECONDS 3600U

typedef struct {
    char command_id[COMMAND_ID_MAX + 1];
    char actuator[12];
    char state[4];
    int used;
} CommandCacheEntry;

E53_IA1_Data_TypeDef E53_IA1_Data;
static osMutexId_t g_device_mutex;
static volatile int g_fan_on;
static volatile int g_light_on;
static volatile uint32_t g_fan_deadline;
static volatile uint32_t g_light_deadline;
static CommandCacheEntry g_command_cache[COMMAND_CACHE_SIZE];
static unsigned int g_command_cache_cursor;

static uint32_t DeadlineAfterSeconds(unsigned int seconds)
{
    uint64_t ticks = (uint64_t)seconds * (uint64_t)osKernelGetTickFreq();
    return osKernelGetTickCount() + (uint32_t)ticks;
}

static int DeadlineReached(uint32_t deadline)
{
    return deadline != 0U && (int32_t)(osKernelGetTickCount() - deadline) >= 0;
}

static void PrintState(const char *reason)
{
    printf("AGRI_STATE FAN %s LIGHT %s REASON %s\r\n",
        g_fan_on ? "ON" : "OFF", g_light_on ? "ON" : "OFF", reason);
}

static void SetActuator(const char *actuator, int enabled, unsigned int duration_seconds)
{
    if (strcmp(actuator, "FAN") == 0) {
        Motor_StatusSet(enabled ? ON : OFF);
        g_fan_on = enabled;
        g_fan_deadline = enabled && duration_seconds > 0U ? DeadlineAfterSeconds(duration_seconds) : 0U;
    } else {
        Light_StatusSet(enabled ? ON : OFF);
        g_light_on = enabled;
        g_light_deadline = enabled && duration_seconds > 0U ? DeadlineAfterSeconds(duration_seconds) : 0U;
    }
}

static CommandCacheEntry *FindCachedCommand(const char *command_id)
{
    unsigned int i;
    for (i = 0; i < COMMAND_CACHE_SIZE; i++) {
        if (g_command_cache[i].used && strcmp(g_command_cache[i].command_id, command_id) == 0) {
            return &g_command_cache[i];
        }
    }
    return NULL;
}

static void RememberCommand(const char *command_id, const char *actuator, const char *state)
{
    CommandCacheEntry *entry = &g_command_cache[g_command_cache_cursor % COMMAND_CACHE_SIZE];
    (void)snprintf(entry->command_id, sizeof(entry->command_id), "%s", command_id);
    (void)snprintf(entry->actuator, sizeof(entry->actuator), "%s", actuator);
    (void)snprintf(entry->state, sizeof(entry->state), "%s", state);
    entry->used = 1;
    g_command_cache_cursor++;
}

static void RejectCommand(const char *command_id, const char *actuator, const char *state, const char *reason)
{
    printf("AGRI_ACK %s %s %s FAILED %s\r\n",
        command_id[0] ? command_id : "UNKNOWN",
        actuator[0] ? actuator : "FAN",
        state[0] ? state : "OFF",
        reason);
}

static int IsValidCommandId(const char *command_id)
{
    size_t length;
    size_t i;
    if (command_id == NULL) {
        return 0;
    }
    length = strlen(command_id);
    if (length == 0U || length > COMMAND_ID_MAX) {
        return 0;
    }
    for (i = 0; i < length; i++) {
        char value = command_id[i];
        if (!((value >= 'a' && value <= 'z') || (value >= 'A' && value <= 'Z') ||
            (value >= '0' && value <= '9') || value == '-' || value == '_' || value == '.' || value == ':')) {
            return 0;
        }
    }
    return 1;
}

static int ParseDuration(const char *value, unsigned int *duration_seconds)
{
    char *end = NULL;
    unsigned long parsed;
    if (value == NULL || duration_seconds == NULL || value[0] == '\0') {
        return 0;
    }
    parsed = strtoul(value, &end, 10);
    if (end == value || *end != '\0' || parsed > MAX_RUN_SECONDS) {
        return 0;
    }
    *duration_seconds = (unsigned int)parsed;
    return 1;
}

static hi_u32 AgriControlCommand(hi_s32 argc, const hi_char **argv)
{
    char actuator[12] = {0};
    const char *command_id = argc > 0 && argv[0] != NULL ? argv[0] : "";
    const char *requested_actuator = argc > 1 && argv[1] != NULL ? argv[1] : "";
    const char *state = argc > 2 && argv[2] != NULL ? argv[2] : "";
    unsigned int duration_seconds = 0;
    CommandCacheEntry *cached;
    int enabled;

    if (argc != 4 || !IsValidCommandId(command_id) ||
        !ParseDuration(argc > 3 ? argv[3] : NULL, &duration_seconds)) {
        RejectCommand(command_id, requested_actuator, state, "INVALID_COMMAND");
        return HI_ERR_SUCCESS;
    }
    (void)snprintf(actuator, sizeof(actuator), "%s", requested_actuator);
    if (strcmp(actuator, "LIGHT") == 0) {
        (void)snprintf(actuator, sizeof(actuator), "%s", "GROW_LIGHT");
    }
    if ((strcmp(actuator, "FAN") != 0 && strcmp(actuator, "GROW_LIGHT") != 0) ||
        (strcmp(state, "ON") != 0 && strcmp(state, "OFF") != 0) ||
        (strcmp(state, "ON") == 0 && duration_seconds > MAX_RUN_SECONDS) ||
        (strcmp(state, "ON") == 0 && strcmp(actuator, "FAN") == 0 && duration_seconds == 0U) ||
        (strcmp(state, "OFF") == 0 && duration_seconds != 0U)) {
        RejectCommand(command_id, actuator, state, "INVALID_COMMAND");
        return HI_ERR_SUCCESS;
    }

    cached = FindCachedCommand(command_id);
    if (cached != NULL) {
        if (strcmp(cached->actuator, actuator) != 0 || strcmp(cached->state, state) != 0) {
            RejectCommand(command_id, actuator, state, "IDEMPOTENCY_MISMATCH");
            return HI_ERR_SUCCESS;
        }
        printf("AGRI_ACK %s %s %s SUCCEEDED DUPLICATE\r\n", command_id, actuator, state);
        PrintState("DUPLICATE");
        return HI_ERR_SUCCESS;
    }

    enabled = strcmp(state, "ON") == 0;
    osMutexAcquire(g_device_mutex, osWaitForever);
    SetActuator(actuator, enabled, duration_seconds);
    RememberCommand(command_id, actuator, state);
    printf("AGRI_ACK %s %s %s SUCCEEDED APPLIED\r\n", command_id, actuator, state);
    PrintState("COMMAND");
    osMutexRelease(g_device_mutex);
    return HI_ERR_SUCCESS;
}

static const at_cmd_func g_agri_command_table[] = {
    {"+AGRI", 5, NULL, NULL, (at_call_back_func)AgriControlCommand, NULL},
};

static void SensorTask(void *argument)
{
    (void)argument;
    while (1) {
        osMutexAcquire(g_device_mutex, osWaitForever);
        E53_IA1_Read_Data();
        if (g_fan_on && DeadlineReached(g_fan_deadline)) {
            SetActuator("FAN", 0, 0);
            PrintState("TIMEOUT");
        }
        if (g_light_on && DeadlineReached(g_light_deadline)) {
            SetActuator("GROW_LIGHT", 0, 0);
            PrintState("TIMEOUT");
        }

        printf("Lux Value is %.2f\r\n", E53_IA1_Data.Lux);
        printf("Humidity is %.2f\r\n", E53_IA1_Data.Humidity);
        printf("Temperature is %.2f\r\n", E53_IA1_Data.Temperature);
        PrintState("PERIODIC");
        osMutexRelease(g_device_mutex);
        usleep(1000000);
    }
}

static void ExampleEntry(void)
{
    osThreadAttr_t sensor_attr = {0};
    hi_u32 register_result;

    E53_IA1_Init();
    Light_StatusSet(OFF);
    Motor_StatusSet(OFF);
    g_device_mutex = osMutexNew(NULL);
    if (g_device_mutex == NULL) {
        printf("AGRI_BOOT FAILED MUTEX\r\n");
        return;
    }

    sensor_attr.name = "AgriSensorTask";
    sensor_attr.stack_size = SENSOR_TASK_STACK_SIZE;
    sensor_attr.priority = SENSOR_TASK_PRIO;

    register_result = hi_at_register_cmd(g_agri_command_table, 1);
    if (register_result != HI_ERR_SUCCESS) {
        printf("AGRI_BOOT FAILED AT_REGISTER %u\r\n", register_result);
        return;
    }
    if (osThreadNew(SensorTask, NULL, &sensor_attr) == NULL) {
        printf("AGRI_BOOT FAILED THREAD\r\n");
        return;
    }
    printf("AGRI_BOOT READY REMOTE_ACTUATORS_V3\r\n");
}

APP_FEATURE_INIT(ExampleEntry);
