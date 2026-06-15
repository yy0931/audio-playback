type Recording = {
    dom: HTMLAudioElement
    [Symbol.dispose](): void
}

class Recorder {
    static async create() {
        return new Recorder(await navigator.mediaDevices.getUserMedia({
            audio: true,
        }))
    }

    readonly #stream
    readonly #mediaRecorder
    readonly #chunks: Blob[] = []
    #resolve: ((recording: Recording) => void) | null = null
    #reject: ((reason?: any) => void) | null = null

    constructor(stream: MediaStream) {
        this.#stream = stream
        this.#mediaRecorder = new MediaRecorder(stream);
        this.#mediaRecorder.addEventListener("dataavailable", (ev) => {
            this.#chunks.push(ev.data)
        })
        this.#mediaRecorder.addEventListener("stop", () => {
            const dom = new Audio(URL.createObjectURL(new Blob(this.#chunks, {
                type: this.#mediaRecorder.mimeType,
            })))
            this.#resolve?.({
                dom,
                [Symbol.dispose]() {
                    URL.revokeObjectURL(dom.src)
                }
            })
        })

        this.#mediaRecorder.addEventListener("error", (ev: any) => {
            this.#reject?.(ev.error ?? new Error("MediaRecorder encountered an error"))
        })
    }

    record(): () => Promise<Recording> {
        this.#chunks.length = 0
        this.#mediaRecorder.start()
        const promise = new Promise<Recording>((resolve, reject) => {
            this.#resolve = resolve
            this.#reject = reject
        })
        return /* stop */async () => {
            await new Promise((resolve) => { setTimeout(resolve, 500) })
            this.#mediaRecorder.stop()
            return promise
        }
    }

    [Symbol.dispose]() {
        if (this.#mediaRecorder.state !== "inactive") {
            this.#mediaRecorder.stop()
        }
        for (const track of this.#stream.getTracks()) {
            track.stop()
        }
    }
}

const main = async () => {
    const buttons = {
        record: document.getElementById("main-button--record")! as HTMLDivElement,
        recording: document.getElementById("main-button--recording")! as HTMLDivElement,
    } as const

    document.getElementById("main-button")!.addEventListener("click", () => {
        document.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }))
    })

    const setMainButtonText = (buttonName: keyof typeof buttons) => {
        for (const [k, v] of Object.entries(buttons)) {
            if (k === buttonName) {
                v.classList.remove("hidden")
            } else {
                v.classList.add("hidden")
            }
        }
    }

    const showAudioControl = (audioEl: HTMLAudioElement) => {
        audioEl.controls = true

        const audioContainerEl = document.getElementById("audio-container")!
        audioContainerEl.innerHTML = ""
        audioContainerEl.append(audioEl)

        return {
            [Symbol.dispose]() {
                audioContainerEl.innerHTML = ""
            }
        }
    }

    const waitEnterKey = async () => {
        while ((await new Promise<KeyboardEvent>((resolve) => document.addEventListener("keydown", resolve, { once: true }))).code !== "Enter");
    }

    setMainButtonText("record")
    await waitEnterKey()

    using recorder = await Recorder.create()
    while (true) {
        const stop = recorder.record()
        setMainButtonText("recording")
        await waitEnterKey()
        using audio = await stop()
        using _ = showAudioControl(audio.dom)
        await audio.dom.play()
        setMainButtonText("record")
        await waitEnterKey()
        audio.dom.pause()
    }
}

await main()
