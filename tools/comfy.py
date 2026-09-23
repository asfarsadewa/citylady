"""Queue Qwen-Image 2.1 and YuE2 jobs on the local ComfyUI and collect the outputs.

usage: python tools/comfy.py jobs.json [--only name1,name2]
jobs.json: [{"kind":"image","name":"bg_harbor","prompt":"...","w":2048,"h":896,"seed":1,"refs":["path.png"]},
            {"kind":"music","name":"theme","style":"...","lyrics":"...","seconds":120,"seed":7}]
Outputs land in art/raw/<name>.png or art/raw/<name>.flac. Existing outputs are skipped.
env: COMFY_HOST (default http://127.0.0.1:8188), COMFY_OUTPUT (path to the ComfyUI output folder).
"""
import json, sys, time, uuid, shutil, urllib.request, os, pathlib

HOST = os.environ.get("COMFY_HOST", "http://127.0.0.1:8188")
COMFY_OUT = pathlib.Path(os.environ.get("COMFY_OUTPUT", "ComfyUI/output"))  # the ComfyUI output folder
ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "art" / "raw"
NEG = "blurry, watermark, text artifacts, signature, jpeg artifacts, deformed hands, extra fingers, lowres"


def post(path, body):
    req = urllib.request.Request(HOST + path, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req))


def upload(path):
    boundary = uuid.uuid4().hex
    data = pathlib.Path(path).read_bytes()
    name = f"cl_{pathlib.Path(path).name}"
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{name}\"\r\nContent-Type: image/png\r\n\r\n").encode() + data + \
        f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(HOST + "/upload/image", data=body, headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    return json.load(urllib.request.urlopen(req))["name"]


def image_graph(job):
    prefix = f"citylady/{job['name']}"
    g = {
        "1": {"class_type": "UnetLoaderGGUF", "inputs": {"unet_name": "qwen-image-2.1-Q8_0.gguf"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen3vl_8b_int8_convrot.safetensors", "type": "qwen_image", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "qwen_image_2.1_vae_bf16.safetensors"}},
        "4": {"class_type": "QwenImage21Cache", "inputs": {"model": ["1", 0], "device": "auto", "dtype": "default"}},
        "5": {"class_type": "TextEncodeQwenImage21", "inputs": {"clip": ["2", 0], "vae": ["3", 0], "prompt": job["prompt"],
              "negative_prompt": job.get("neg", NEG), "resolution": job.get("res", 1024)}},
        "6": {"class_type": "EmptyLatentImage", "inputs": {"width": job.get("w", 1024), "height": job.get("h", 1024), "batch_size": 1}},
        "7": {"class_type": "KSampler", "inputs": {"model": ["4", 0], "positive": ["5", 0], "negative": ["5", 1], "latent_image": ["6", 0],
              "seed": job.get("seed", 0), "steps": job.get("steps", 25), "cfg": job.get("cfg", 1.0), "sampler_name": "euler",
              "scheduler": "simple", "denoise": 1.0}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["3", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": prefix}},
    }
    for i, ref in enumerate(job.get("refs", []), 1):
        nid = f"r{i}"
        g[nid] = {"class_type": "LoadImage", "inputs": {"image": upload(ROOT / ref)}}
        g["5"]["inputs"][f"images.image_{i}"] = [nid, 0]
    return g


def music_graph(job):
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "yue2_3b_bf16.safetensors"}},
        "2": {"class_type": "YuE2GenerateMusic", "inputs": {"clip": ["1", 1], "style": job["style"], "lyrics": job["lyrics"], "abc": "",
              "seed": job.get("seed", 0), "mode": "full", "max_duration": job.get("seconds", 120), "temperature": 1.0, "top_p": 0.95,
              "top_k": 100, "repetition_penalty": 1.2}},
        "3": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["2", 0]}},
        "4": {"class_type": "EmptyYuE2LatentAudio", "inputs": {"seconds": ["2", 1], "batch_size": 1}},
        "5": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0],
              "seed": 42, "steps": 32, "cfg": 1.0, "sampler_name": "dpm_2", "scheduler": "sgm_uniform", "denoise": 1.0}},
        "6": {"class_type": "VAEDecodeAudio", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveAudio", "inputs": {"audio": ["6", 0], "filename_prefix": f"citylady/{job['name']}"}},
    }


def main():
    jobs = json.load(open(sys.argv[1], encoding="utf-8"))
    only = None
    if "--only" in sys.argv:
        only = set(sys.argv[sys.argv.index("--only") + 1].split(","))
    RAW.mkdir(parents=True, exist_ok=True)
    pending = {}
    for job in jobs:
        ext = ".png" if job["kind"] == "image" else ".flac"
        dest = RAW / (job["name"] + ext)
        if only and job["name"] not in only:
            continue
        if dest.exists() and not only:
            continue
        g = image_graph(job) if job["kind"] == "image" else music_graph(job)
        pid = post("/prompt", {"prompt": g, "client_id": "citylady"})["prompt_id"]
        pending[pid] = (job, dest)
        print("queued", job["name"], flush=True)
    while pending:
        time.sleep(3)
        for pid in list(pending):
            h = json.load(urllib.request.urlopen(f"{HOST}/history/{pid}"))
            if pid not in h:
                continue
            job, dest = pending.pop(pid)
            st = h[pid].get("status", {})
            if st.get("status_str") == "error":
                print("FAILED", job["name"], json.dumps(st.get("messages"))[-800:], flush=True)
                continue
            for out in h[pid]["outputs"].values():
                for f in out.get("images", []) + out.get("audio", []):
                    src = COMFY_OUT / f.get("subfolder", "") / f["filename"]
                    shutil.copy(src, dest)
                    print("done", job["name"], "->", dest.name, flush=True)


if __name__ == "__main__":
    main()
