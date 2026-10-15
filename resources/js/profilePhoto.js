(function () {
    var wrapper = document.querySelector(".profile-image-wrapper");

    if (!wrapper) {
        return;
    }

    wrapper.addEventListener("click", function () {
        wrapper.classList.toggle("is-open");
    });

    wrapper.addEventListener("mouseleave", function () {
        wrapper.classList.remove("is-open");
    });

    document.addEventListener("pointerdown", function (event) {
        if (!wrapper.contains(event.target)) {
            wrapper.classList.remove("is-open");
        }
    });
})();
